const ObjectID  = require('mongodb').ObjectID

module.exports = db => {
    class Savable {
        constructor(obj){
            console.log('CONSTRUCTOR')
            this._id    = null
            this._class = this.__proto__.constructor.name
            this._empty = true

            Savable.classes = Savable.classes || []
            Savable.classes.push(this.__proto__.constructor)

            this.populate(obj)
        }

        populate(obj){
            if (obj){
                for (const key in obj) this[key] = obj[key]
                this._empty = false
            }
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
                    if (!this._id) err(new ReferenceError('Id is empty'))
                    if (!this._class) err(new ReferenceError('Class is empty'))

                    this.collection.findOne({_id: ObjectID(this._id)}).then( data => {
                        if (!data){
                            err(new ReferenceError('Document Not Found'))
                        }
                        this.populate(data)
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
                                await obj[key].save()
                            }
                            result[key] = {_id: obj[key]._id, _class: obj[key]._class}
                        }
                        else {
                            console.log('recursion', obj, key)
                            result[key] = await recursiveSlicer(obj[key])
                        }
                    }
                    else {
                        result[key] = obj[key]
                    }
                }
                return result;
            }

            const toSave = await recursiveSlicer(this)
            console.log(toSave)

            if (!this._id){ //first time
                delete toSave._id
                delete toSave._empty
                const { insertedId } = await this.collection.insertOne(toSave)
                this._id = insertedId
            }
            else { //updateOne
                this.collection.updateOne(toSave, {_id: this._id})
            }
        }
    }
    return Savable
}
