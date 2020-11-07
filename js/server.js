const bodyParser = require('body-parser');
const compression = require('compression');
const helmet = require('helmet');
const express = require('express');
const app = express();
const moment = require('moment');
app.locals.moment = require('moment');
const path = require('path');
const database = require('./database');
const steamAPI = require('./steamapi');

function runAsyncWrapper (callback) {
    return function (req, res, next) {
      callback(req, res, next)
        .catch(next)
    }
  }

const publicPath = path.resolve(__dirname, '..', 'public');
const pagesPath = path.resolve(__dirname, '..', 'pages');
const indexPath = path.resolve(pagesPath, 'index.html');
const errorPagePath = path.resolve(pagesPath, 'error.html');
app.set('view engine', 'ejs');
app.set('views', pagesPath);
app.use(express.static(publicPath));
app.use(bodyParser.urlencoded({ extended: true })); 
app.use(compression()); //Compress all routes
app.use(helmet({
  contentSecurityPolicy: false, // Breaks images if true
}));

const port = process.env.PORT || 80;

app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});

app.get('/', function (req, res) {
    res.sendFile(indexPath);
  });
  
  
app.get('/:username/achievements/:game/:appID', runAsyncWrapper(async(req, res) => { 
 
    const username = req.params.username
    const appID = req.params.appID  

    // Search Database for Username to get their User ID
    await database.SteamProfile.findOne({steamUsername: username}, async function (error, profile) {
      if (profile) {
        const gameIndex = profile.Games.findIndex(game => game.appID == appID);
        const achievements = await steamAPI.getGameAchievements(appID)

        if (achievements.length < 1) {
            return res.status(404).sendFile(errorPagePath);
        }
        const globalStats = await steamAPI.getGlobalAchievementsStats(appID);

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
        profile: profile,
        game: profile.Games[gameIndex],
        achievementData: achievements
      });
      } else {
        return res.status(404).sendFile(errorPagePath);
      } 
    })
  }))
      
  app.get('/:username', runAsyncWrapper(async(req, res) => {
      const username = req.params.username
      if (username.includes(".css")) { // Block direct access to CSS files
        return res.status(404).sendFile(errorPagePath);
      }
    
      await database.SteamProfile.findOne({steamUsername: username}, async function (error, user) {
        if (user) {
           res.render('profile.ejs', {profile: user})
        } else {
          return res.redirect('/?steamid=' + username);
        } 
      })
  }))
  
  app.post('/getuser', runAsyncWrapper(async(req, res) => {
    let userID;
    const userRequest = req.body.steamid
    const requestURL = "https://steamcommunity.com/id/"
  
    if (userRequest.includes("://steamcommunity.com/id/")) { // If steam profile url entered, make request
      userID = await steamAPI.getSteamUserID(userRequest);
    } else { // Otherwise, append username to steam url and make request,
      userID = await steamAPI.getSteamUserID(requestURL + userRequest + "/");
    }
  
    if (userID) {
      const profile = await steamAPI.getUserSummary(userID);
      const allGames = await steamAPI.getOwnedGames(userID);
      const supportedGames = await steamAPI.getOwendGamesWithAchievementSupport(allGames, userID);
      if (supportedGames) {
        return res.status(200).send({result: 'redirect', url: `${profile.steamUsername}`})
      } else {
        return res.status(404).sendFile(errorPagePath);
      }
    } else {
      return res.status(404).sendFile(errorPagePath);
    }
  }))