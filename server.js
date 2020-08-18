const express = require("express");
const session = require("express-session");
const crypto = require("crypto");
const SpotifyWebApi = require("spotify-web-api-node");
const app = express();
let access_token = undefined;

app.set("view engine", "pug");
app.use(express.static("public"));
app.set("trust proxy", 1);
app.use(
  session({
    resave: true,
    saveUninitialized: false,
    secret: process.env.SESSION_SECRET,
    maxAge: 60000 * 5
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", function(request, response) {
  response.render("index");
});

const redirectUri =
  "https://" + process.env.PROJECT_DOMAIN + ".glitch.me/callback";
const scopes = ["user-modify-playback-state"];
const showDialog = true;

let spotifyApi = new SpotifyWebApi({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  redirectUri: redirectUri
});

app.get("/authorize", function(request, response) {
  let state = crypto.randomBytes(12).toString("hex");
  request.session.state = state;
  let authorizeURL = spotifyApi.createAuthorizeURL(scopes, state, showDialog);
  response.redirect(authorizeURL);
});

app.get("/callback", function(request, response) {
  if (request.session.state !== request.query.state) {
    response.sendStatus(401);
  }
  let authorizationCode = request.query.code;
  spotifyApi.authorizationCodeGrant(authorizationCode).then(
    data => {
      request.session.access_token = data.body["access_token"];
      response.redirect("/bartender");
    },
    error => {
      console.log(
        "Something went wrong when retrieving the access token!",
        error.message
      );
    }
  );
});

app.get("/logout", function(request, response) {
  request.session.destroy();
  response.redirect("/");
});


app.get("/bartender", async (request, response) => {
  let possibleGenres = [];
  try {
    possibleGenres = await getAllGenres(request.session.access_token);
    response.render("bartender", {
      genres: possibleGenres
    });
  } catch (err) {
    possibleGenres = ["dance", "club", "edm", "power-pop"];
    response.redirect("/authorize")
  }
  
});


const tempos = {
  0: 0,
  1: 70,
  2: 100,
  3: 124,
  4: 128,
  5: 150
};
app.all("/cocktail", async function(request, response, next) {
  const selectedGenres = request.body.selectedGenres ? request.body.selectedGenres : undefined
  const tempo = request.body.tempo ? request.body.tempo : undefined
  const partyMode = request.body.partyMode ? request.body.partyMode : undefined
  const isHipster = request.body.isHipster ? request.body.isHipster : undefined
  const isTophits = request.body.isTophits ? request.body.isTophits : undefined
  const isAcoustic = request.body.isAcoustic ? request.body.isAcoustic : undefined
  const isVocals = request.body.isVocals ? request.body.isVocals : undefined

  try {
    //const { genres, tracks } = await playBasedOnFilter(request.session.access_token, selectedGenres, isPartyMode);
    //access_token, selectedGenres, tempo, isPartyMode, partyMode, isHipster, isTophits, isAcoustic, isVocals) 
    //const { genres, tracks } = await playBasedOnFilter(request.session.access_token, ['swedish'], undefined, undefined, 2, undefined, undefined, undefined, undefined, undefined);
    const { genres, tracks } = await playBasedOnFilter(request.session.access_token, selectedGenres, tempo, partyMode, isHipster, isTophits, isAcoustic, isVocals);
    
    if(tracks.length == 0){
      response.redirect("/missingIngredients")
    }else{
      //render everything for page
      response.render("cocktail", {
        tracks: tracks,
        genres: genres,
        tempos,
        tempo,
        partyMode,
        isHipster,
        isTophits,
        isAcoustic,
        isVocals
      });
    }
    

  } catch (error) {
    console.error(error);
    if(error.statusCode == 401){
      response.redirect("/authorize")
    }else{
      response.redirect("/missingIngredients")
    }
  }
});

app.get("/missingIngredients", async function(request, response, next){
  response.render("missingIngredients");
});


let listener = app.listen(process.env.PORT, function() {
  console.log("Your app is listening on port " + listener.address().port);
});

/** Gets all genres from spotify.
 * @return Promise<{genres}>
 */
const getAllGenres = async access_token => {
  let loggedInSpotifyApi = new SpotifyWebApi();
  loggedInSpotifyApi.setAccessToken(access_token);

  const data = (await loggedInSpotifyApi.getAvailableGenreSeeds()).body.genres;
  return data;
};

/** Gets filter inputs and plays songs based on given filters
 */
const playBasedOnFilter = async (access_token, selectedGenres, tempo, partyMode, isHipster, isTophits, isAcoustic, isVocals) => {
  let loggedInSpotifyApi = new SpotifyWebApi();
  loggedInSpotifyApi.setAccessToken(access_token);
    
  const partyModes = {
    0: {},
    2: {
      min_energy: 0.9,
      min_danceability: 0.5,
      min_tempo: 125,
      min_valence: 0.6
    },
    4: {
      min_energy: 0.9,
      min_danceability: 0.6,
      min_tempo: 128,
      min_valence: 0.7,
    },
    6: {
      min_energy: 0.9,
      min_danceability: 0.8,
      min_tempo: 130,
      min_valence: 0.8,
    }
  };
  
  
  const years = {};

  //Get recommendation based on list of genres
  let options = {};

  if(selectedGenres){
    options = {
      ...options,
      seed_genres: selectedGenres
    };
  }
  if(isHipster){
    options = {
      ...options,
      max_popularity: 15
    };
  }
  if(tempo && tempos[tempo]){
    options = {
      ...options,
      target_tempo: tempos[tempo]
    };
  }
  if(isTophits){
    options = {
      ...options,
      min_popularity: 70
    };
  }else if(isTophits == false){
    options = {
      ...options,
      max_popularity: 80
    };
  }
  if(isAcoustic){
    options = {
      ...options,
      min_acousticness: 0.85
    };
  }else if(isAcoustic == false){
    options = {
      ...options,
      max_acousticness: 0.85
    };
  }
  if(isVocals){
    options = {
      ...options,
      max_instrumentalness: 0.45
    };
  }
  else if(isVocals == false){
    options = {
      ...options,
      min_instrumentalness: 0.55
    };
  }
  if (partyMode) {
    options = {
      ...partyModes[partyMode],
      ...options
    };
  }
  console.log("Options chosen are: ", options)

  //get tracks
  const tracks = (await loggedInSpotifyApi.getRecommendations(options)).body
    .tracks;

  //get track uris
  const trackUris = tracks.map(track => track.uri);
  //console.log("Uris:", trackUris);

  //play list of tracks
  const playOptions = { uris: trackUris };
  await loggedInSpotifyApi.play(playOptions);
  
  return {genres: selectedGenres, tracks}
};