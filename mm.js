const ObjectID    = require("mongodb").ObjectID;

module.exports = db => {
    const identityMap = {}
    class Savable {
        constructor(obj, empty=false){
            if (obj && obj._id){ 
                if (obj._id.toString() in identityMap){
                    return identityMap[obj._id]
                }
            }


            this._id    = null
            this._class = this.__proto__.constructor.name
            this._empty = true

            Savable.classes                                  = Savable.classes || {}
            Savable.classes[this.__proto__.constructor.name] = this.__proto__.constructor

            if (obj){
                this.populate(obj)
                this._empty = empty
            }
        }



        populate(obj, empty){
            function convertSavables(obj){
                for (const key in obj){
                    if (Savable.isSavable(obj[key])){
                        obj[key] = Savable.newSavable(obj[key])
                    }
                    else if (typeof obj[key] === 'object'){
                        convertSavables(obj[key])
                    }
                }
            }

            for (const key in obj) this[key] = obj[key]   

            convertSavables(this)
        }

        get _empty(){
            return !!this.then
        }

        set _empty(value){
            if (value){
                this.then = (cb, err) => {
                    if (!this._empty){
                        cb(this)
                        return this
                    }
                    delete this.then
                    if (!this._id)    err(new ReferenceError('Id is empty'))
                    if (!this._class) err(new ReferenceError('Class is empty'))

                    this.collection.findOne({_id: this._id}).then( data => {
                        if (!data){
                            err(new ReferenceError('Document Not Found'))
                        }
                        console.log('load', this)
                        this.populate(data)
                        console.log('caching in await', this._id)
                        identityMap[this._id.toString()] = this
                        cb(this)
                    })
                    return this
                }
            }
            else {
                delete this.then
            }
        }

        get collection(){
            return db.collection(this._class)
        }

        async save(){
            if (this.empty) return;

            async function recursiveSlicer(obj){
                let result = obj instanceof Array ? [] : {}
                for (const key in obj){
                    if (obj[key] && typeof obj[key] === 'object'){
                        if (obj[key] instanceof Savable){
                            if (!(obj[key]._id)){
                                await obj[key].save().catch(err => console.log('ERR', err))
                            }
                            result[key] = {_id: obj[key]._id, _class: obj[key]._class}
                        }
                        else {
                            result[key] = await recursiveSlicer(obj[key])
                        }
                    }
                    else {
                        result[key] = obj[key]
                    }
                }
                return result;
            }

            const {_id, _empty, then, ...toSave} = await recursiveSlicer(this)

            if (!this._id){ //first time
                const { insertedId } = await this.collection.insertOne(toSave)
                this._id = insertedId

            }
            else { //update
                await this.collection.updateOne({_id: this._id},  {$set: toSave}).catch(err => console.log('UPDATE ERR', err))
            }
            console.log('caching in save', this._id)
            identityMap[this._id.toString()] = this
        }

        static isSavable(obj){
            //console.log(obj._id, obj._class)
            return obj && obj._id && obj._class
        }

        static newSavable(obj){
            let className = obj._class || "Savable"
            if (obj instanceof Savable.classes[className]){
                return obj
            }
            
            return new Savable.classes[className](obj, true)
        }
    }
    return Savable
}
