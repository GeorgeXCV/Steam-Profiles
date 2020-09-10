const SteamAPI = require('steamapi');
const steam = new SteamAPI("D03CA2B80CAEC610FC852C3140540C58");

const express = require('express')
const app = express()
const bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({ extended: true })); 

app.set('view engine', 'ejs');
app.set('views', __dirname);

function runAsyncWrapper (callback) {
  return function (req, res, next) {
    callback(req, res, next)
      .catch(next)
  }
}

app.post('/getuserid', runAsyncWrapper(async(req, res) => {
  const userID = await getSteamUserID(req.body.steamid);
  const games = await getOwnedGames(userID);
  const supportedGames = await getOwendGamesWithAchievementSupport(games, userID);
  res.render('profile.ejs', {gamedata: supportedGames})
}))

const port = 8080;

app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});

async function getSteamUserID(url) {
    try {
        const userID = await steam.resolve(url);
        console.log(userID);
        return userID;
    } catch (error) {
        console.log("Failed to get Steam User ID. Error: " + error);
    }
}

async function getOwnedGames(userID) {
  try {
     const games = await steam.getUserOwnedGames(userID);
     return games;
  } catch (error) {
    console.log("Failed to get Steam User Owned Games. Error: " + error)
  }
}

async function getOwendGamesWithAchievementSupport(games, userID) {
    try { 
        let supportedGames = [];

        await Promise.all(games.map(async (game) => {
          const achievements = await getUserGameAchievements(userID, game.appID);
          if (achievements) {
                  supportedGames.push(game)
               } 
        }))
        return supportedGames;
    } catch (error) {
      console.log("Failed to get supported games. Error: " + error);
    }
}

async function getUserGameAchievements(userID, appID) {
  try {
      const achievements = await steam.getUserAchievements(userID, appID);
      return achievements;
  } catch (error) {
      // Expected to fail sometimes, not all games support achievements
      // console.log("Failed to get user achievements. Error: " + error)
  }
}
// https://steamcommunity.com/id/georgea95/

// [
//   Game {
//     name: 'Half-Life',
//     appID: 70,
//     playTime: 17,
//     playTime2: 0,
//     logoURL: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/70/6bd76ff700a8c7a5460fbae3cf60cb930279897d.jpg', 
//     iconURL: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/70/95be6d131fc61f145797317ca437c9765f24b41c.jpg'  
//   },
//   Game {
//     name: 'Counter-Strike: Source',
//     appID: 240,
//     playTime: 1146,
//     playTime2: 0,
//     logoURL: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/240/ee97d0dbf3e5d5d59e69dc20b98ed9dc8cad5283.jpg',
//     iconURL: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/240/9052fa60c496a1c03383b27687ec50f4bf0f0e10.jpg' 
//   },


// async function getSteamUserSummary(userID) {
//   try {
//       const test = await steam.getUserSummary(userID);
//       console.log(test);
//   } catch (error) {
//       console.log("Failed to get Steam User Summary. Error: " + error);
//   }
// }

// getSteamUserSummary("76561198001183532");
