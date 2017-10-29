require('dotenv').config()

const mongoose = require('mongoose')
const mongoosastic = require('mongoosastic')
const es = require('elasticsearch')

const client = new es.Client({
  host: process.env.ES_HOST
})

mongoose.Promise = global.Promise

const schema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    es_indexed: true,
    es_type: 'keyword'
  },
  sourceId: {
    type: String,
    required: true
  },
  filename: {
    type: String,
    es_indexed: true
  },
  source: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  ner: {
    type: mongoose.Schema.Types.Mixed
  },
  title: {
    type: String,
    es_indexed: true
  },
  text: {
    type: String,
    es_indexed: true
  },
  keywords: {
    type: [String]
  },
  downloadUrl: {
    type: String
  },
  creationDate: {
    type: Date,
    es_indexed: true,
    es_format: 'strict_date_optional_time||epoch_millis'
  },
  lastSaveDate: {
    type: Date,
    es_indexed: true,
    es_format: 'strict_date_optional_time||epoch_millis'
  },
  lastModified: {
    type: Date,
    es_indexed: true,
    es_format: 'strict_date_optional_time||epoch_millis'
  },
  creator: {
    type: String,
    es_indexed: true
  },
  lastAuthor: {
    type: String,
    es_indexed: true
  },
  publisher: {
    type: String,
    es_indexed: true
  },
  importDate: {
    type: Date,
    default: Date.now
  }
})

schema.set('toJSON', {virtuals: true})
schema.set('toObject', {virtuals: true})

schema.plugin(mongoosastic, {
  esClient: client
})

module.exports = mongoose.model('Document', schema)
