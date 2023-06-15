const express = require("express");
const app = express();
app.use(express.json());

const { open } = require("sqlite");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");

const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");

const jwt = require("jsonwebtoken");

const format = require("date-fns/format");

let database = null;

const initializeDBWithServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(error.message);
    process.exit(1);
  }
};

initializeDBWithServer();

//MIDDLEWARE FUNCTION
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//SAMPLE API CALL
app.get("/user/", async (request, response) => {
  const query = `SELECT * FROM tweet ORDER BY tweet_id;`;
  const dbResponse = await database.all(query);
  response.send(dbResponse);
});

//CREATE NEW USER API
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const query = `SELECT * FROM user WHERE username='${username}';`;
  const securedPassword = await bcrypt.hash(password, 10);

  const getUser = await database.get(query);

  if (getUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    const checkingPassword = password.length;
    if (checkingPassword < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const postQuery = `INSERT INTO user (username,name,password,gender)
      VALUES ('${username}','${name}','${securedPassword}','${gender}');`;

      const createNewUser = await database.all(postQuery);
      const lastId = createNewUser.lastID;
      response.send("User created successfully");
    }
  }
});

//login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const query = `SELECT * FROM user WHERE username='${username}';`;
  const checkingValidUser = await database.get(query);

  if (checkingValidUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isValidPassword = await bcrypt.compare(
      password,
      checkingValidUser.password
    );
    if (isValidPassword) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//GET API
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const query = `SELECT * FROM user WHERE username='${username}';`;
  const getUser = await database.get(query);

  const getQuery = `SELECT user_id AS userId,tweet ,date_time AS dateTime
   FROM tweet WHERE user_id='${getUser.user_id}';`;
  const dbResponse = await database.all(getQuery);
  response.send(dbResponse);
});

//FOLLOWING API
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const query = `SELECT user_id FROM user WHERE username='${username}';`;
  const loginUserId = await database.get(query);

  const newQuery = `SELECT name FROM user INNER JOIN follower ON 
  user.user_id = follower.following_user_id 
  WHERE follower.follower_user_id=${loginUserId.user_id};`;
  const dbResponse = await database.all(newQuery);
  response.send(dbResponse);
});

//FOLLOWER API
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const query = `SELECT user_id FROM user WHERE username='${username}';`;
  const loginUserId = await database.get(query);
  console.log(loginUserId.user_id);

  const newQuery = `SELECT name FROM user INNER JOIN follower ON 
  user.user_id = follower.follower_user_id 
  WHERE follower.following_user_id=${loginUserId.user_id};`;
  const dbResponse = await database.all(newQuery);
  response.send(dbResponse);
});

//POST TWEET API
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const query = `SELECT user_id FROM user WHERE username='${username}';`;
  const loginUserId = await database.get(query);
  const date = format(new Date(), "yyyy-MM-dd");

  const { tweet } = request.body;
  const tweetQuery = `INSERT INTO tweet(tweet,user_id,date_time)
    VALUES ('${tweet}','${loginUserId.user_id}','${date}')  ;`;
  const dbResponse = await database.run(tweetQuery);
  const newID = dbResponse.lastID;
  response.send("Created a tweet");
});

//Tweet Following
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const query = `SELECT user_id FROM user WHERE username='${username}';`;
  const loginUserId = await database.get(query);

  const { tweetId } = request.params;
  const checkingLoginUserTweet = `SELECT 
  tweet.tweet_id
  FROM 
  follower INNER JOIN tweet 
  ON 
  tweet.user_id = follower.follower_user_id
  WHERE tweet.user_id=${loginUserId.user_id} GROUP BY tweet.tweet_id;`;
  const result = await database.all(checkingLoginUserTweet);

  const checkingTweet = result.map(
    (each) => each.tweet_id === parseInt(tweetId)
  );

  if (checkingTweet.includes(true)) {
    const getLikes = `SELECT Count() AS likes FROM like 
    WHERE tweet_id=${tweetId};`;
    const getResponse = await database.get(getLikes);

    const getReply = `SELECT COUNT() AS replies FROM reply WHERE tweet_id=${tweetId};`;
    const getReplyResponse = await database.get(getReply);

    const tweetQuery = `SELECT tweet,date_time FROM tweet WHERE tweet_id=${tweetId};`;
    const tweetAndDateTime = await database.get(tweetQuery);

    const obj = {
      tweet: tweetAndDateTime.tweet,
      likes: getResponse.likes,
      replies: getReplyResponse.replies,
      dateTime: tweetAndDateTime.date_time,
    };
    response.send(obj);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//TWEET LIKES
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const query = `SELECT user_id FROM user WHERE username='${username}';`;
    const loginUserId = await database.get(query);

    const { tweetId } = request.params;
    const checkingLoginUserTweet = `SELECT 
  tweet.tweet_id
  FROM 
  follower INNER JOIN tweet 
  ON 
  tweet.user_id = follower.follower_user_id
  WHERE tweet.user_id=${loginUserId.user_id} GROUP BY tweet.tweet_id;`;
    const result = await database.all(checkingLoginUserTweet);

    const checkingTweet = result.map(
      (each) => each.tweet_id === parseInt(tweetId)
    );

    if (checkingTweet.includes(true)) {
      const likesUserQuery = `SELECT * FROM user 
      INNER JOIN like ON user.user_id = like.user_id
      WHERE like.tweet_id=${tweetId};`;
      const getLikes = await database.all(likesUserQuery);

      const namesList = getLikes.map((each) => each.username);
      const obj = {
        likes: namesList,
      };
      response.send(obj);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//TWEETS replies
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const query = `SELECT user_id FROM user WHERE username='${username}';`;
    const loginUserId = await database.get(query);

    const { tweetId } = request.params;
    const checkingLoginUserTweet = `SELECT 
  tweet.tweet_id
  FROM 
  follower INNER JOIN tweet 
  ON 
  tweet.user_id = follower.follower_user_id
  WHERE tweet.user_id=${loginUserId.user_id} GROUP BY tweet.tweet_id;`;
    const result = await database.all(checkingLoginUserTweet);

    const checkingTweet = result.map(
      (each) => each.tweet_id === parseInt(tweetId)
    );

    if (checkingTweet.includes(true)) {
      const replyQuery = `SELECT user.name,reply.reply FROM reply 
      INNER JOIN user ON user.user_id = reply.user_id
      WHERE reply.tweet_id=${tweetId};`;
      const getReply = await database.all(replyQuery);
      const replies = {
        replies: getReply,
      };
      response.send(replies);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//GET ALL user TWEETS
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const userQuery = `SELECT * FROM user WHERE username='${username}';`;
  const getUserDetails = await database.get(userQuery);

  const tweetQuery = `SELECT 
  tweet.tweet,
  COUNT(like.like_id) AS likes,
  COUNT(reply.reply_id) AS replies,
  tweet.date_time AS dateTime FROM tweet 
  INNER JOIN like ON tweet.user_id = like.user_id 
  INNER JOIN reply ON tweet.user_id = reply.user_id
  WHERE tweet.user_id=${getUserDetails.user_id} 
  GROUP BY tweet.tweet_id ;`;
  const tweetDetails = await database.all(tweetQuery);

  response.send(tweetDetails);
});

//DELETE API
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const query = `SELECT user_id FROM user WHERE username='${username}';`;
    const loginUserId = await database.get(query);

    const { tweetId } = request.params;
    const checkingLoginUserTweet = `SELECT * FROM tweet WHERE user_id=${loginUserId.user_id};`;
    const result = await database.all(checkingLoginUserTweet);

    const checkingTweetId = result.map(
      (each) => each.tweet_id === parseInt(tweetId)
    );

    if (checkingTweetId.includes(true)) {
      const deleteQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId};`;
      const dbResponse = await database.run(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
