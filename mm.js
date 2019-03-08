const ObjectID    = require("mongodb").ObjectID;
const asynchronize = require('./asynchronize').asynchronize

let i=0;

module.exports = db => {
    const identityMap = {}

    class Savable {
        constructor(obj, empty=false){
            //TODO check type for return right class 
            if (obj && obj._id){
                console.log('savable...')
                if (!empty){
                    identityMap[obj._id.toString()] = this
                }
                //console.log(identityMap)
                if (obj._id.toString() in identityMap){
                    console.log(`in identity map ${obj._id}`)
                }
            }


            this._id    = null
            this._class = this.__proto__.constructor.name
            this._empty = true

            Savable.addClass(this.__proto__.constructor)

            if (obj){
                this.populate(obj)
                this._empty = empty
            }
            if ((obj && obj._id) && (obj._id.toString() in identityMap)) return identityMap[obj._id]
        }



        populate(obj){
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
                    //TODO identityMap check for already loaded object into memory

                    this.collection.findOne(this._id).then( data => {
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

        get createdAt(){
            return this._id ? new Date(this._id.getTimestamp()) : null
        }

        get collection(){
            return db.collection(this._class)
        }

        async save(noRefs=false){
            if (this.empty) return;

            const syncRelations = async () => {
                //TODO: remove refs if some ref detached since load from db
                if (noRefs) return

                if (!(this && this.__proto__ && this.__proto__.constructor && this.__proto__.constructor.relations)) return 


                async function getValueByField(field, savable) {
                    let path = field.split('.');
                    await savable;
                    let result = savable;
                    let prev;
                    let lastKey = path.pop()
                    while (prev = result, result = result[path.shift()] && path.length);
                    return {value: prev[lastKey], obj: prev, lastKey};
                }

                let setBackRef = async (backRef, foreignSavable) => {
                    console.log('BACKREF for', backRef, foreignSavable.name)
                    const {value: backRefValue, 
                            obj: backRefObj, 
                        lastKey: backRefKey} = await getValueByField(backRef, foreignSavable)

                    if (backRefValue instanceof Array){
                        console.log('backref -to-many array')
                        if (!backRefValue.includes(this)){
                            backRefValue.push(this)
                        }
                    }
                    //else if (backRefValue instanceof Set){
                        //console.log('backref -to-many set')
                        //backRefValue.add(this)
                    //}
                    else {
                        console.log('backref -to-one')
                        backRefObj[backRefKey] = this
                    }
                    await foreignSavable.save(true)
                }



                for (const relation in this.__proto__.constructor.relations){
                    const backRef = this.__proto__.constructor.relations[relation]

                    let {value, obj, lastKey: key} = await getValueByField(relation, this)
                    if (value){
                        if (value instanceof Savable){
                            console.log('one-to-*')
                            await setBackRef(backRef, value)
                        }
                        if (value instanceof Array /*|| value instanceof Set*/){
                            console.log('many-to-*')
                            for (const foreignSavable of value){
                                await setBackRef(backRef, foreignSavable)
                            }
                        }
                    }
                }
            }

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

            //TODO: UPSERT
            if (!this._id){ //first time
                const { insertedId } = await this.collection.insertOne(toSave)
                this._id = insertedId
            }
            else { //update
                await this.collection.updateOne({_id: this._id},  {$set: toSave}).catch(err => console.log('UPDATE ERR', err))
            }
            identityMap[this._id.toString()] = this

            await syncRelations()
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

        static addClass(_class){ //explicit method to add class to Savable registry for instantiate right class later
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

        static get relations(){ 
            //empty default relations, acceptable: {field: foreignField}, where:
            //field and foreign field can be Savable, Array or Set
            //both fields can be specified as "field", "field.subfield" 
            //or field: {subfield: foreignField} //TODO later if needed
            //TODO: move it into object instead of class to give more flexibility, for example
            //if person has children, it can have backRef father or mother depending on sex:
            //return {
            //    children: this.sex === 'male' ? 'father': 'mother'
            //}
            return {}
        }
    }

    Savable.classes                                  = {Savable}

    return Savable
}
