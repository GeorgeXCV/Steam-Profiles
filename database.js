//Import the mongoose module
const mongoose = require('mongoose');

//Set up default mongoose connection
mongoose.connect('mongodb://127.0.0.1/SteamProfiles', {useNewUrlParser: true, useUnifiedTopology: true});

//Get the default connection
var db = mongoose.connection;

//Bind connection to error event (to get notification of connection errors)
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

db.once('open', function() {
    console.log("Database Live!")

    const SteamProfileSchema = new mongoose.Schema({
        steamUsername: String,
        steamUserID: String,
        Games: {

        }
    })
    
    module.exports.SteamProfile = mongoose.model('SteamProfile', SteamProfileSchema);
  });
