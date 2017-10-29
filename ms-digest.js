require('dotenv').config()

const mongoose = require('mongoose')
const request = require('request')
const AWS = require('aws-sdk')
const Consumer = require('sqs-consumer')
const async = require('async')
const exec = require('child_process').exec
const fs = require('fs')
const net = require('net')
// Temp use gramophone, will replace with NaturalNode or other
const gramophone = require('gramophone')


const File = require('./lib/document')
const Service = require('./lib/source')

const TIKA_META = `${process.env.TIKA_HOST}/meta`
const TIKA_TEXT = `${process.env.TIKA_HOST}/tika`


// Mongo connection
let mongoOpts = {
  poolSize: Number(process.env.MONGO_POOLSIZE) || 4,
  useMongoClient: true
}
let mongoUri = `mongodb://${process.env.MONGO_HOST}/${process.env.MONGO_DB}`
mongoose.connect(mongoUri, mongoOpts)

const sqs = new AWS.SQS({
  apiversion: '2012-11-05',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
})

const app = Consumer.create({
  queueUrl: process.env.AWS_QUEUE_URL,
  terminateVisibilityTimeout: true,
  sqs: sqs,
  handleMessage: (message, done) => {
    processFile(message, (err) => {
      if (err) {
        done(err)
      } else {
        done()
      }
    })
  }
})

app.on('error', (err) => {
  console.error(err.message)
})

console.log('Starting Microsoft Digest Service')
app.start()

function processFile (message, done) {
  let fileId = message.Body
  console.log('Downloading file', fileId)
  File.findById(fileId)
  .then(file => {
    Service.findById(file.sourceId)
    .then(service => {
      if (service === null) {
        console.error('service null')
        return done('service null')
      } else {
        // Download the file
        let opts = {
          url: file.downloadUrl,
          headers: {
            'Authorization': `Bearer ${service.token}`
          },
          followRedirect: false
        }
        request(opts, function(err, response, data) {
          if (err) {
            console.error(err)
            return done(err)
          } else if (response.statusCode === 302) {
            let downloadUrl = response.headers.location
            request({
              url: downloadUrl,
              encoding: null
            }, function(err, response, data) {
              if (err) {
                console.error(err)
                return done(err)
              } else if (response.statusCode !== 200) {
                console.error(response.statusCode)
                return done(response.statusCode)
              } else {
                let tmp = `/tmp/${file._id.toString()}${file.filename.substring(file.filename.lastIndexOf('.'))}`
                fs.writeFile(tmp, data, 'binary', function(err) {
                  if (err) {
                    console.error(err)
                    return done(err)
                  } else {
                    async.series([
                      function(next) {
                        // Extract file metadata with Tika
                        exec(`curl -T ${tmp} ${TIKA_META} --header 'Accept: application/json'`, (err, stdout, stderr) => {
                          if (err) {
                            console.error(err)
                          } else {
                            file.metadata = JSON.parse(stdout)

                            file.title = file.metadata.title || ''
                            file.creationDate = file.metadata['Creation-Date'] || ''
                            file.lastSaveDate = file.metadata['Last-Save-Date'] || ''
                            file.lastModified = file.metadata['Last-Modified'] || ''
                            file.creator = file.metadata['dc:creator'] || ''
                            file.lastAuthor = file.metadata['Last-Author'] || ''
                            file.publisher = file.metadata.publisher || ''

                            file.save(err => {
                              if (err) {
                                console.log(err)
                              }
                            })
                          }
                          next()
                        })
                      },
                      function(next) {
                        // Extract file text with Tika
                        exec(`curl -T ${tmp} ${TIKA_TEXT}`, (err, stdout, stderr) => {
                          if (err) {
                            console.error(err)
                          } else {
                            file.text = stdout.replace(/\r?\n|\r|\t/g, ' ').trim()
                            file.save(err => {
                              if (err) {
                                console.error(err)
                              }
                            })
                          }
                          next()
                        })
                      },
                      function(next) {
                        // Extract NER from file text
                        if (file.text.length === 0) {
                          console.log(`No text to be extracted from ${tmp}`)
                          return next()
                        }
                        let socket = new net.Socket()
                        socket.connect(process.env.NER_PORT, 'localhost', () => {
                          socket.write(file.text + '\n')
                        })
                        socket.on('data', data => {
                          let regexp = /<([A-Z]+?)>(.+?)<\/\1>/g
                          let str = data.toString()
                          let tags = {
                            LOCATION: [],
                            ORGANIZATION: [],
                            DATE: [],
                            MONEY: [],
                            PERSON: [],
                            PERCENT: [],
                            TIME: []
                          }
                          let m
                          while ((m = regexp.exec(str)) !== null) {
                            if (m.index === regexp.lastIndex) {
                              regexp.lastIndex++
                            }
                            tags[m[1]].push(m[2])
                          }
                          socket.destroy()
                          file.ner = tags
                          file.save(err => {
                            if (err) {
                              console.error(err)
                            }
                          })
                          next()
                        })
                      },
                      function(next) {
                        // Extract keywords from text
                        // Using gramophone for now, will want to use NaturalNode or other later...
                        file.keywords = gramophone.extract(file.text, { limit: 15 })
                        next()
                      },
                      function(next) {
                        // Convert file to image, if possible
                        next()
                      }
                    ], (err, result) => {
                      if (err) {
                        console.err(err)
                      }
                      done()
                      fs.unlinkSync(tmp)
                    })
                  }
                })
              }
            })
          } else {
            console.error(`OneDrive response ${response.statusCode} ${response.statusMessage}`)
            return done(response.statusCode)
          }
        })
      }
    })
    .catch(err => {
      console.error(err)
      done(err)
    })
  })
  .catch(err => {
    console.error(err)
    done(err)
  })
}


/*
      // Refresh access tokens if needed
      //sdk.getTokensRefreshGrant(service.refreshToken, (err, tokens) => {
      sdk.getTokensRefreshGrant(service.refresh, (err, tokens) => {
        if (err) {
          console.error(err)
          return done(err)
        } else {
          service.token = tokens.accessToken
          service.refresh = tokens.refreshToken
          service.save(err => {
            if (err) {
              console.error(err)
            }
          })

        }
      })
*/
