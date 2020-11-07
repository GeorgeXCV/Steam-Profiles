//Import the mongoose module
const mongoose = require('mongoose');

//Set up default mongoose connection
const devURL = "mongodb://localhost:27017/SteamProfiles"
mongoose.connect(process.env.MONGODB_URL|| devURL, {useNewUrlParser: true, useUnifiedTopology: true});

//Get the default connection
var db = mongoose.connection;

//Bind connection to error event (to get notification of connection errors)
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

db.once('open', function() {
    console.log("Database Live!")

    const SteamProfileSchema = new mongoose.Schema({
        steamUsername: {
            type: String,
            required: true,
        },
        steamUserID: {
            type: String,
            required: true,
            index: {
                unique: true,
            }
        },
        nickname: String,
        avatar: String,
        completedGames: String,
        totalAchievements: String,
        unearnedAchievements: String,
        completion: String,
        Games: {
            type: Array
        }
      }, {
        collation: {locale: 'en', strength: 2} // Allow case insensitive queries to work
    })
    module.exports.SteamProfile = mongoose.model('SteamProfile', SteamProfileSchema);
  });

