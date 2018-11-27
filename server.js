'use strict';

// Application Dependencies
const express = require('express');
const superagent = require('superagent');
const cors = require('cors');
const pg = require('pg');

// Load environment variables
require('dotenv').config();

// Application Setup
const app = express();
const PORT = process.env.PORT;
app.use(cors());

// Database Setup
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', err => console.error(err));

// API Routes
app.get('/location', getLocation);
app.get('/weather', getWeather);
app.get('/movies', getMovies);
app.get('/yelp', getYelp);
app.get('/meetups', getMeetups);
app.get('/trails' , getTrails)

// Make sure the server is listening for requests
app.listen(PORT, () => console.log(`Listening on ${PORT}`));

//============ Models============//

// Location
function Location(query, res) {
  this.tableName = 'locations'
  this.search_query = query;
  this.formatted_query = res.body.results[0].formatted_address;
  this.latitude = res.body.results[0].geometry.location.lat;
  this.longitude = res.body.results[0].geometry.location.lng;
  this.created_at = Date.now();
}
Location.lookupLocation = (location) => {
  const SQL = `SELECT * FROM locations WHERE search_query=$1;`
  const values = [location.query];

  return client.query(SQL, values)
    .then(result => {
      if(result.rowCount > 0){
        console.log('Match On Location')
        location.cacheHit(result);
      }else {
        console.log('No Location Match')
        location.cacheMiss();
      }
    })
    .catch(console.error)
}
Location.prototype = {
  save: function () {
    console.log(`saving new location`)
    const SQL = `INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`
    const values = [this.search_query, this.formatted_query, this.latitude, this.longitude];

    return client.query(SQL, values)
      .then(result => {
        this.id = result.rows[0].id;
        return this
      });
  }
};

// Weather
function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0, 15);
}

function Movie(movie) {
  this.title = movie.title;
  this.released_on = movie.release_date;
  this.total_votes = movie.vote_count;
  this.average_votes = movie.vote_average;
  this.popularity = movie.popularity;
  this.image_url = `https://image.tmdb.org/t/p/w600_and_h900_bestv2${movie.poster_path}`;
  this.overview = movie.overview;
}

function Yelp(location) {
  this.url = location.url;
  this.name = location.name;
  this.rating = location.rating;
  this.price = location.price;
  this.image_url = location.image_url;
}

function Meetup(meetup) {
  this.link = meetup.link
  this.name = meetup.name
  this.host = meetup.group.name
  this.creation_date = new Date(meetup.created).toString().slice(0,15);
}

function Trails(trail){
  this.trail_url = trail.url
  this.name = trail.name
  this.location = trail.location
  this.length = trail.length
  this.condition_date = trail.conditionDate.slice(0, 10)
  this.condition_time = trail.conditionDate.slice(11)
  this.conditions = trail.conditionStatus
  this.stars = trail.stars
  this.star_votes = trail.starVotes
  this.summary = trail.summary
}

// Helper Functions
function getLocation(request, response){
  Location.lookupLocation({
    tableName: Location.tableName,
    query: request.query.data,

    cacheHit: function(result){
      console.log(result.rows[0])
      response.send(result.rows[0])
    },
    cacheMiss: function(){
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${this.query}&key=${process.env.GEOCODE_API_KEY}`;

      return superagent.get(url)
        .then(res => {
          const location = new Location(this.query, res);
          location.save()
            .then(location => response.send(location));
        })
        .catch(error => handleError(error));
    }
  })
}

function getWeather(request, response) {
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;

  superagent.get(url)
    .then(result => {
      const weatherSummaries = result.body.daily.data.map(day => {
        return new Weather(day);
      });
      response.send(weatherSummaries);
    })
    .catch(error => handleError(error, response));
}

function getMovies(request, response) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.THEMOVIEDB_API_KEY}&language=en-US&query=${request.query.data.search_query}`;
  superagent.get(url)
    .then(result => {
      const movieSummaries = result.body.results.map(movie => {
        return new Movie(movie);
      })

      response.send(movieSummaries);
    })
    .catch(error => handleError(error, response));
}

function getMeetups(request, response){
  const url = `https://api.meetup.com/find/upcoming_events?lon=${request.query.data.longitude}&lat=${request.query.data.latitude}&key=${process.env.MEETUPS_API_KEY}`;

  superagent.get(url)
    .then(result => {
      const meetupSum = result.body.events.map(meetup => {
        return new Meetup(meetup)
      })
      response.send(meetupSum)
    })
    .catch(error => handleError(error, response))
}



function getTrails(request, response){
  const url = `https://www.hikingproject.com/data/get-trails?lat=${request.query.data.latitude}&key=${process.env.HIKING_API_KEY}&maxDistance=10&lon=${request.query.data.longitude}`

  superagent.get(url)
    .then(result => {
      const trailsSum = result.body.trails.map(trail => {
        return new Trails(trail)
      })
      response.send(trailsSum)
    })
    .catch(error => handleError(error, response))
}

function getYelp(request, response) {
  const url = `https://api.yelp.com/v3/businesses/search?latitude=${request.query.data.latitude}&longitude=${request.query.data.longitude}`;

  superagent.get(url)
    .set(`authorization`, `Bearer ${process.env.YELP_API_KEY}`)
    .then(result => {
      const yelpSummaries = result.body.businesses.map(location => {
        return new Yelp(location)
      })
      response.send(yelpSummaries);
    })
    .catch(error => handleError(error, response));
}
// Error handler
function handleError(err, res) {
  // console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
}

