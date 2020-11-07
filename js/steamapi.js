const {config} = require('./config.js')
const database = require('./database');
const SteamAPI = require('steamapi');
const steam = new SteamAPI(config.apiKey);

module.exports = {
    getSteamUserID: async function  (url) {
      try {
          const trimURL = url.split("/");
          const username = trimURL[trimURL.length-2];
          let userID;
          userID = await this.checkIfExistingUser(username);
         
          if (!userID) { 
            userID = await this.resolveSteamURL(url); // Get User ID
            // Create new User in the Database
            await database.SteamProfile.create({steamUsername: username, steamUserID: userID}, async function (err, profile) {
              if (profile) {
                userID = profile.steamUserID
              } else if (err) {
                throw 'Failed to save to database: ' + err
              }
            })
        }
      return userID;
      } catch (error) {
          console.log("Failed to get Steam User ID. Error: " + error);
      }
  },

  checkIfExistingUser: async function (username) {
    try {
      let userID;
        // Search Database for username
        await database.SteamProfile.findOne({steamUsername: username}, async function (error, profile) {
          if (profile) {
             userID = profile.userID;
          } else {
            // If not in Database, we need to create a new entry
            return false
          }
        })
      return userID;
    } catch (error) {
      console.log("Failed to check if exisiting user. Error: " + error);
    }
  },

  resolveSteamURL: async function (url) {
    try {
      const userID = await steam.resolve(url);
      return userID;
    } catch (error) {
      console.log("Failed to resolve steam url. Error: " + error);
    }
  },

  getUserSummary: async function (userID) {
    try {
        const profile = await steam.getUserSummary(userID);
        if (profile) {
          const filter = { steamUserID: userID };
          const update = { nickname: profile.nickname, avatar: profile.avatar.medium};
          const user = await database.SteamProfile.findOneAndUpdate(filter, update);
          console.log(user);
          return user;
        }
    } catch (error) {
      console.log("Failed to get User Summary. Error: " + error);
    }
  },

  getOwnedGames: async function (userID) {
    try {
      const games = await steam.getUserOwnedGames(userID);
      return games;
    } catch (error) {
      console.log("Failed to get Steam User Owned Games. Error: " + error)
    }
  },

  getOwendGamesWithAchievementSupport: async function (games, userID) {
      try { 
          let achievements = [];
          let completedGames = 0;
          let totalAchievements = 0;
          let unearnedAchievements = 0;
          await Promise.all(games.map(async (game) => {
            const gameAchievements = await this.getUserGameAchievements(userID, game.appID);
            if (gameAchievements) {
                    gameAchievements.appID = game.appID  // Copy App ID because needed for request to get game achievement images
                    gameAchievements.logo = game.logoURL // Add image from game object to achievement object      
                    const playTime = game.playTime // Copy Playtime from game object to achievement object
                    if (playTime > 0) {
                      const hours = Math.floor(playTime / 60);          
                      // const minutes = playTime % 60;
                      gameAchievements.playTime = `${hours} hrs on record`
                    }       
                  
                    // Loop through achievements and add string to object which shows user progress
                    let achieved = 0;
                    for(var i = 0; i < gameAchievements.achievements.length; i++) {
                        if (gameAchievements.achievements[i].achieved == true) {
                          achieved++
                          totalAchievements++
                        } else {
                          unearnedAchievements++;
                        }
                    }
                    if (achieved == gameAchievements.achievements.length) {
                      gameAchievements.progress = `All ${achieved} Achievements`
                      gameAchievements.progressPercentage = "100%"; 
                      completedGames++
                    } else {
                      gameAchievements.progress = `${achieved} of ${gameAchievements.achievements.length} Achievements` 
                      gameAchievements.progressPercentage = Math.round((achieved / gameAchievements.achievements.length) * 100).toString() + "%";                  
                    }

                    achievements.push(gameAchievements);
                } 
          }))

          let completion  = (totalAchievements / unearnedAchievements * 100).toFixed(2);
          completion = `${completion}%`
          const filter = { steamUserID: userID };
          const update = { 
            completedGames: completedGames, 
            totalAchievements: totalAchievements,  
            unearnedAchievements: unearnedAchievements, 
            completion: completion, 
            Games: achievements };

          const profile = await database.SteamProfile.findOneAndUpdate(filter, update);
          return true;
      } catch (error) {
        console.log("Failed to get supported games. Error: " + error);
        return false;
      }
  },

  getGameAchievements: async function (appID) {
    try {
      const achievements = await steam.getGameSchema(appID);
      return achievements;
    } catch (error) {
      console.log("Failed to get Game Achievements. Error: " + error)
    }
  },

  getGlobalAchievementsStats: async function (appID) {
    try {
      const globalAchievements = await steam.get(`/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${appID}`,
        `http://api.steampowered.com`,
        `D03CA2B80CAEC610FC852C3140540C58`
        )
      return globalAchievements;
    } catch (error) {
      console.log("Failed to get Global Achievements Stats. Error: " + error)
    }
  },

  getUserGameAchievements: async function  (userID, appID) {
    try {
        const achievements = await steam.getUserAchievements(userID, appID);
        return achievements;
    } catch (error) {
        // Expected to fail sometimes, not all games support achievements
        // console.log("Failed to get user achievements. Error: " + error)
    }
  }
}