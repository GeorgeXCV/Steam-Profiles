const SteamAPI = require('steamapi');
const steam = new SteamAPI("D03CA2B80CAEC610FC852C3140540C58");
const moment = require('moment');
const express = require('express')
const app = express()
const bodyParser = require('body-parser');
const database = require('./database');

app.use(bodyParser.urlencoded({ extended: true })); 
app.use(express.static(__dirname));

app.locals.moment = require('moment');

app.set('view engine', 'ejs');
app.set('views', __dirname);

const port = 8080;

app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});

let supportedGames;

function runAsyncWrapper (callback) {
  return function (req, res, next) {
    callback(req, res, next)
      .catch(next)
  }
}

app.get('/:username', runAsyncWrapper(async(req, res) => {
    const username = req.params.username
    await database.SteamProfile.findOne({steamUsername: username}, async function (error, profile) {
      if (!error) {
         res.render('profile.ejs', {gamedata: profile.Games})
      } else { // TO-DO: Else render error page
        console.log("Failed to get user. Error: " + error);
      } 
    })
}))

app.post('/getuser', runAsyncWrapper(async(req, res) => {
  const userID = await getSteamUserID(req.body.steamid);
  const games = await getOwnedGames(userID);
  const profile = await getOwendGamesWithAchievementSupport(games, userID);
  res.redirect(`${profile.steamUsername}`)
}))

app.get('/achievements', runAsyncWrapper(async(req, res) => { 
  const index = req.query.id
  const appID = req.query.app

  const achievements = await getGameAchievements(appID)
  const globalStats = await getGlobalAchievementsStats(appID);

  for(var i = 0; i < achievements.availableGameStats.achievements.length; i++) {
     let percentage = Math.round(globalStats.achievementpercentages.achievements[i].percent);
     let rarity = "";
     if (percentage >= 50) {
        rarity = "Common"
     } else if (percentage >= 25 && percentage <= 50) {
        rarity = "Uncommon"
     } else if (percentage >= 10 && percentage <= 25) {
        rarity = "Rare"
     } else if (percentage <= 10) {
        rarity = "Ultra Rare"
    }
     achievements.availableGameStats.achievements[i].percentage = percentage.toString() + "%";
     achievements.availableGameStats.achievements[i].rarity = rarity
  }

  res.render('achievements.ejs', {
    game: supportedGames[index],
    achievementData: achievements
  });
 }));

async function getSteamUserID(url) {
    try {
        const trimURL = url.split("/");
        const username = trimURL[trimURL.length-2];
        let userID;
        // Search Database for username
        await database.SteamProfile.findOne({steamUsername: username}, async function (error, profile) {
          if (!error) {
             userID = profile.steamUserID; // If username found, return User ID
          }
        })
        // If not in Database, make API request and store User
        if (!userID) {
        userID = await steam.resolve(url);
        if (userID) {
          await database.SteamProfile.create({steamUsername: username, steamUserID: userID}, async function (err, profile) {
            if (err) {
              throw 'Failed to save to database: ' + err
            }
            userID = profile.steamUserID
          })
        }
      }
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
        let achievements = [];
        await Promise.all(games.map(async (game) => {
          const gameAchievements = await getUserGameAchievements(userID, game.appID);
          if (gameAchievements) {
                  gameAchievements.appID = game.appID  // Copy App ID because needed for request to get game achievement images
                  gameAchievements.logo = game.logoURL // Add image from game object to achievement object

                  // Loop through achievements and add string to object which shows user progress
                  let achieved = 0;
                  for(var i = 0; i < gameAchievements.achievements.length; i++) {
                      if (gameAchievements.achievements[i].achieved == true) {
                        achieved++
                      }
                  }
                  if (achieved == gameAchievements.achievements.length) {
                    gameAchievements.progress = `All ${achieved} Achievements`
                    gameAchievements.progressPercentage = "100%"; 
                  } else {
                    gameAchievements.progress = `${achieved} of ${gameAchievements.achievements.length} Achievements` 
                    gameAchievements.progressPercentage = Math.round((achieved / gameAchievements.achievements.length) * 100).toString() + "%";                  
                  }

                  achievements.push(gameAchievements);
               } 
        }))

        const filter = { steamUserID: userID };
        const update = { Games: achievements };

        const profile = await database.SteamProfile.findOneAndUpdate(filter, update);
        return profile;
    } catch (error) {
      console.log("Failed to get supported games. Error: " + error);
    }
}
 
async function getGameAchievements(appID) {
  try {
     const achievements = await steam.getGameSchema(appID);
     return achievements;
  } catch (error) {
    console.log("Failed to get Game Achievements. Error: " + error)
  }
}

async function getGlobalAchievementsStats(appID) {
  try {
     const globalAchievements = await steam.get(`/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${appID}`,
      `http://api.steampowered.com`,
      `D03CA2B80CAEC610FC852C3140540C58`
      )
     return globalAchievements;
  } catch (error) {
    console.log("Failed to get Global Achievements Stats. Error: " + error)
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

// PlayerAchievements {
//   steamID: '76561198001183532',        
//   gameName: "Assassin's Creed Origins",
//   achievements: [
//     Achievement {
//       api: '001',
//       name: 'First Steps',
//       description: '',
//       achieved: true,
//       unlockTime: 1553361663
//     },
//     Achievement {
//       api: '002',
//       name: "I'm Just Getting Started",
//       description: '',
//       achieved: true,
//       unlockTime: 1553372496
//     },
//     Achievement {
//       api: '060',
//       name: 'Archeologist',
//       description: 'Complete all tours in the Daily Life category',
//       achieved: false,
//       unlockTime: 0
//     },


// Get Schema 
// "achievements": [
//   {
//       "name": "TF_PLAY_GAME_EVERYCLASS",
//       "defaultvalue": 0,
//       "displayName": "Head of the Class",
//       "hidden": 0,
//       "description": "Play a complete round with every class.",
//       "icon": "http://media.steampowered.com/steamcommunity/public/images/apps/440/tf_play_game_everyclass.jpg",
//       "icongray": "http://media.steampowered.com/steamcommunity/public/images/apps/440/tf_play_game_everyclass_bw.jpg"
//   },

// Get Owned Games
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