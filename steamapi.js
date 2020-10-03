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

let profile;

app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});

function runAsyncWrapper (callback) {
  return function (req, res, next) {
    callback(req, res, next)
      .catch(next)
  }
}

app.get('/:username/achievements/:game/:appID', runAsyncWrapper(async(req, res) => { 
 
  const appID = req.params.appID  
  const index = profile.Games.findIndex(game => game.appID == appID);
  
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
    game: profile.Games[index],
    achievementData: achievements
  });
 }));

app.get('/:username', runAsyncWrapper(async(req, res) => {
    const username = req.params.username
    await database.SteamProfile.findOne({steamUsername: username}, async function (error, user) {
      if (user) {
         profile = user;
         res.render('profile.ejs', {profile: user})
      } else { // TO-DO: Else render error page
        return res.redirect('/?steamid=' + username);
      } 
    })
}))

app.post('/getuser', runAsyncWrapper(async(req, res) => {
  let userID;
  const userRequest = req.body.steamid
  const requestURL = "https://steamcommunity.com/id/"

  if (userRequest.includes("://steamcommunity.com/id/")) { // If steam profile url entered, make request
    userID = await getSteamUserID(userRequest);
  } else { // Otherwise, append username to steam url and make request,
    userID = await getSteamUserID(requestURL + userRequest + "/");
  }

  if (userID) {
    await getUserSummary(userID);
    const games = await getOwnedGames(userID);
    profile = await getOwendGamesWithAchievementSupport(games, userID);
    return res.status(200).send({result: 'redirect', url: `${profile.steamUsername}`})
    // res.redirect(`${profile.steamUsername}`)
  } else {
    return res.status(401).send({error: "Failed to get user."})
  }
}))

async function getSteamUserID(url) {
    try {
        const trimURL = url.split("/");
        const username = trimURL[trimURL.length-2];
        let userID;
        let newEntry = false;
        // Search Database for username
        await database.SteamProfile.findOne({steamUsername: username}, async function (error, profile) {
          if (!error) {
             userID = profile.steamUserID; // If username found, return User ID
          } else {
            userID = await steam.resolve(url); // If not in Database, make API request 
            newEntry = true
          }
        })
        
        if (newEntry) { // Then save User ID if got response
          await database.SteamProfile.create({steamUsername: username, steamUserID: userID}, async function (err, profile) {
            if (err) {
              throw 'Failed to save to database: ' + err
            }
            userID = profile.steamUserID
          })
      }
    return userID;
    } catch (error) {
        console.log("Failed to get Steam User ID. Error: " + error);
    }
}

async function getUserSummary (userID) {
  try {
      const profile = await steam.getUserSummary(userID);
      if (profile) {
        const filter = { steamUserID: userID };
        const update = { nickname: profile.nickname, avatar: profile.avatar.medium};
        await database.SteamProfile.findOneAndUpdate(filter, update);
      }
  } catch (error) {
    console.log("Failed to get User Summary. Error: " + error);
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