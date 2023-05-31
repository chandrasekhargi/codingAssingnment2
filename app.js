const express = require("express");
const app = express();
app.use(express.json());

const { open } = require("sqlite");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");

const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");

const jwt = require("jsonwebtoken");

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
  const query = `SELECT * FROM user ORDER BY user_id;`;
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
  console.log(loginUserId.user_id);

  const getFollowingUserIds = `SELECT following_user_id FROM follower WHERE follower_user_id='${loginUserId.user_id}' ;`;
  const getIds = await database.all(getFollowingUserIds);
  const mappingId = getIds.map((each) => each.following_user_id);

  let dbResponse = "";
  for (let x in mappingId) {
    const query = `SELECT name FROM user WHERE user_id=${mappingId[x]};`;
    dbResponse = await database.get(query);
    response.send(dbResponse);
  }
});

module.exports = app;
