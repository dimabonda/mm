const MongoClient = require("mongodb").MongoClient;
const ObjectID    = require("mongodb").ObjectID;
const mm          = require('./mm.js')
const delay       = ms => new Promise(r => setTimeout(r.bind(ms), ms))
 
;(async () => {
    const mongoClient = new MongoClient("mongodb://localhost:27017/", { useNewUrlParser: true });
    const client      = await mongoClient.connect()
    const db          = client.db('mm')
    const Savable     = mm(db).Savable
    const SlicedSavable = mm(db).sliceSavable([ObjectID("5c9571219be797377361c65a"), 'user', 'admin'])
    //const SlicedSavable = mm(db).sliceSavable([])
    //

    class Notebook extends SlicedSavable{
        static get relations(){
            return {
                owner: "notebook"
            }
        }
    }

    class User extends SlicedSavable{
        static get relations(){
            return {
                children: "parent",
                parent: "children",
                friends: "friends",
                notebook: "owner",
            }
        }
    }
    Savable.addClass(Notebook)
})()
 
