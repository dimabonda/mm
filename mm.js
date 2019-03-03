const ObjectID    = require("mongodb").ObjectID;
const asynchronize = require('./asynchronize').asynchronize

module.exports = db => {
    const identityMap = {}
    class Savable {
        constructor(obj, empty=false){
            //TODO check type for return right class 
            if ((obj && obj._id) && (obj._id.toString() in identityMap)) return identityMap[obj._id]


            this._id    = null
            this._class = this.__proto__.constructor.name
            this._empty = true

            Savable.addClass(this.__proto__.constructor)

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

                    this.collection.findOne(_id).then( data => {
                        if (!data){
                            err(new ReferenceError('Document Not Found'))
                        }
                        this.populate(data)
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
            identityMap[this._id.toString()] = this
        }

        static isSavable(obj){
            //console.log(obj._id, obj._class)
            return obj && obj._id && obj._class
        }

        static newSavable(obj, empty=true){
            let className = obj._class || "Savable"
            if (obj.__proto__.constructor === Savable.classes[className]){
                return obj
            }
            
            return new Savable.classes[className](obj, empty)
        }

        static addClass(_class){
            Savable.classes[_class.name] = _class
        }


        static get m(){
            return new Proxy({}, {
                get(obj, _class){
                    if (_class in obj){
                        return obj[_class]
                    }

                    return  obj[_class] = {
                        * find(query, projection){
                            let cursor = db.collection(_class).find(query, projection)
                            let cursorGen = asynchronize({s: cursor.stream(), chunkEventName: 'data', endEventName: 'close'})
                            for (const pObj of cursorGen()){
                                yield new Promise((ok, fail) => 
                                    pObj.then(obj => ok(Savable.newSavable(obj, false)), 
                                              err => fail(err)))
                            }
                        },
                        async findOne(query, projection){
                            let result = await db.collection(_class).findOne(query, projection)
                            return Savable.newSavable(result, false)
                        }
                    }
                },

                set(obj, propName, value){
                }
            })



        }
    }

    Savable.classes                                  = {Savable}

    return Savable
}
