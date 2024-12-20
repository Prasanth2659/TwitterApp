const express = require('express')
const bcrypt = require('bcrypt')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const jwt = require('jsonwebtoken')
const path = require('path')
const dbPath = path.join(__dirname, 'twitterClone.db')

const app = express()
app.use(express.json())

let db = null

const initializ = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () =>
      console.log('Server running Successfull at http://localhost:3000'),
    )
  } catch (e) {
    console.log(`DB Error: ${e.messege}`)
    process.exit(1)
  }
}
initializ()

const getFollwingPplIdsofUser = async username => {
  const followingUserQ = `
    select 
        following_user_id 
    from
        follower INNER JOIN 
        user On user.user_id = follower.follower_user_id
    where
        user.username = '${username}'
`
  const following = await db.all(followingUserQ)
  const allIds = following.map(i => i.following_user_id)
  return allIds
}

const checkValidation = async (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken) {
    jwt.verify(jwtToken, 'My_SECRET_Token', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        request.userId = payload.userId
        next()
      }
    })
  } else {
    response.status(401)
    response.send('Invalid JWT Token')
  }
}

const tweetAccesVerification = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params

  const getTweeetQ = `select * 
                      from 
                          tweet INNER JOIN follower ON
                          tweet.user_id = follower.following_user_id
                      where
                          tweet.user_id  = ${tweetId} AND 
                          follower.user_id = ${userId}
        `
  const dbResponse = await db.get(getTweeetQ)
  if (dbResponse === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

// API 1 Register
app.post('/register/', async (request, response) => {
  let {username, password, name, gender} = request.body

  const selectUserQ = `select * from user where username = '${username}'

        `
  const userDetails = await db.get(selectUserQ)
  if (userDetails !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const createUserQ = `insert into
                                 user(username, password, name,gender)
                                 values
                                    ('${username}',
                                    '${hashedPassword}',
                                    '${name}',
                                    '${gender}'                            
                                    )
                                 `
      await db.run(createUserQ)
      response.send('User created successfully')
    }
  }
})

// API 2 Login
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQ = `select * from user where username = '${username}'`
  const dbResponse = await db.get(selectUserQ)
  if (dbResponse !== undefined) {
    const isPasswordMateched = await bcrypt.compare(
      password,
      dbResponse.password,
    )
    if (isPasswordMateched) {
      const payload = {username, userId: dbResponse.user_id}
      const jwtToken = jwt.sign(payload, 'My_SECRET_Token')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  } else {
    response.status(400)
    response.send('Invalid user')
  }
})

// API 3 Returns 4 tweets

app.get('/user/tweets/feed/', checkValidation, async (request, response) => {
  const {username} = request
  const followingPplIds = await getFollwingPplIdsofUser(username)

  getTweetsuery = `select username, tweet, date_time as dateTime
                     from user INNER JOIN tweet ON user.user_id = tweet.user_id
                     where 
                        user.user_id IN (${followingPplIds})
                        order by date_time DESC
                        LIMIT 4;  
                      `
  const tweets = await db.all(getTweetsuery)
  response.send(tweets)
})

// API 4

app.get('/user/following/', checkValidation, async (request, response) => {
  const {username, userId} = request

  const selectQ = `select name from follower INNER JOIN user ON

                     user.user_id = follower.following_user_id

                    where
                        follower_user_id = ${userId}
                        `
  const followingPPL = await db.all(selectQ)
  response.send(followingPPL)
})

// API 5
app.get('/user/followers/', checkValidation, async (request, response) => {
  const {username, userId} = request

  const select = `
      select DISTINCT name 
      from
          follower INNER JOIN user ON
          user.user_id = follower.follower_user_id
      where 
          following_user_id = '${userId}'

  `
  const dbResponse = await db.all(select)
  response.send(dbResponse)
})

// API 6

app.get(
  '/tweets/:tweetId/',
  checkValidation,
  tweetAccesVerification,
  async (request, response) => {
    const {username, userId} = request

    const {tweetId} = request.params

    const selectQ = `
    select tweet,
    
        (select count() from like where tweet_id = '${tweetId}' ) as likes,
        (select count() from reply where tweet_id = '${tweetId}' ) as replies,
        date_time as dateTime
    from
        tweet 
    where 
        tweet.tweet_id = '${tweetId}'

  `
    const tweet = await db.get(selectQ)
    response.send(tweet)
  },
)

// API 7
app.get(
  '/tweets/:tweetId/likes/',
  checkValidation,
  tweetAccesVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const selectQ = `
    select username
    from user INNER JOIN like ON 
        user.user_id = like.user_id
    where
        tweet_id = '${tweetId}'

  `
    const dbResponse = await db.all(selectQ)
    const userArray = dbResponse.map(i => i.username)
    response.send({likes: userArray})
  },
)

// API 8
app.get(
  '/tweets/:tweetId/replies/',
  checkValidation,
  tweetAccesVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const selectQ = `
      select name, reply 
      from user INNER JOIN  reply ON user.user_id = reply.user_id
      where tweet_id = '${tweetId}'
  `
    const replys = await db.all(selectQ)
    response.send({replies: replys})
  },
)

// API 9
app.get('/user/tweets/', checkValidation, async (request, response) => {
  const {userId} = request

  const selectUserQ = `
    select tweet,
      count (DISTINCT like_id)  as likes,
      count (DISTINCT reply_id) as replies,
      date_time as dateTime
    from
        tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id LEFT JOIN like ON tweet.tweet_id = like.tweet_id
    where
        tweet.user_id = ${userId}

    group by tweet.tweet_id
  `
  const dbResponse = await db.all(selectUserQ)
  response.send(dbResponse)
})

// API 10

app.post('/user/tweets/', checkValidation, async (request, response) => {
  const {tweet} = request.body

  const userId = parseInt(request.userId)
  const dateTime = new Date().toJSON().substring(0, 19).replace('T', ' ')
  const createTweet = `
  
    insert into tweet (
      tweet, user_id, date_time
    )
    values (
      '${tweet}',${userId},'${dateTime}'
    )
  `
  await db.run(createTweet)
  response.send('Created a Tweet')
})

// API 11

app.delete('/tweets/:tweetId/', checkValidation, async (request, response) => {
  const {tweetId} = request.params
  const {userId} = request

  const selectQ = `
    select * 
    from 
        tweet
    where
        tweet_id = ${tweetId} AND user_id = ${userId}
  
  `
  const tweet = await db.get(selectQ)
  console.log(tweet)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const deletQ = `delete from tweet where tweet_id = ${tweetId}`
    await db.run(deletQ)
    response.send('Tweet Removed')
  }
})

module.exports = app
