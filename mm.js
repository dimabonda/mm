const ObjectID    = require("mongodb").ObjectID;
const asynchronize = require('./asynchronize').asynchronize

let i=0;

module.exports = db => {

    class Savable {
        constructor(obj, ref, empty=false){
            this._id    = null
            this._ref   = ref
            this._class = this.__proto__.constructor.name
            this._empty = true

            Savable.addClass(this.__proto__.constructor)

            if (obj){
                this.populate(obj)
                this._empty = empty
            }
        }

        saveRelations(){
            this._loadRelations = {};
            for (const relation in this.__proto__.constructor.relations){
                this._loadRelations[relation] = this[relation] instanceof Array ? [...this[relation]] : this[relation]
            }
        }



        populate(obj){
            const convertSavables = (obj) => {
                for (const key in obj){
                    if (Savable.isSavable(obj[key])){
                        obj[key] = (this._ref && 
                                    obj[key]._id.toString() == this._ref._id.toString()) ? 
                                                       this._ref : 
                                                       Savable.newSavable(obj[key], this)
                    }
                    else if (typeof obj[key] === 'object'){
                        convertSavables(obj[key])
                    }
                }
            }

            Object.assign(this, obj)



            convertSavables(this)

            this.saveRelations()
            //this._id = obj._id
        }

        get _empty(){
            return !!this.then
        }

        set _empty(value){
            if (value){
                this.then = (cb, err) => {
                    let stamp = (new Date()).getTime()
                    delete this.then

                    if (!this._id)    err(new ReferenceError('Id is empty'))
                    if (!this._class) err(new ReferenceError('Class is empty'))

                    this.collection.findOne(this._id).then( data => {
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

        get createdAt(){
            return this._id ? new Date(this._id.getTimestamp()) : null
        }

        get collection(){
            return db.collection(this._class)
        }

        async save(noRefs=false, noSync=false){
            if (this.empty) return;

            const syncRelations = async () => {
                if (noSync) return
                if (!(this && this.__proto__ && this.__proto__.constructor && this.__proto__.constructor.relations)) return 


                async function getValueByField(field, savable) {
                    let path = field.split('.');
                    await savable.catch(e => console.log('GET VALUE BY FIELD ERROR'));
                    let result = savable;
                    let prev;
                    let lastKey = path.pop()
                    while (prev = result, result = result[path.shift()] && path.length);
                    return {value: prev[lastKey], obj: prev, lastKey};
                }

                let setBackRef = async (backRef, foreignSavable) => {
                    const {value: backRefValue, 
                            obj: backRefObj, 
                        lastKey: backRefKey} = await getValueByField(backRef, foreignSavable)

                    if (backRefValue instanceof Array){
                        if (!backRefValue.includes(this)){
                            backRefValue.push(this)
                        }
                    }
                    else {
                        backRefObj[backRefKey] = this
                    }
                    noRefs || await foreignSavable.save(true)
                }


                
                for (const relation in this.__proto__.constructor.relations){
                    const backRef = this.__proto__.constructor.relations[relation]

                    const loadRelation = this._loadRelations[relation]
                    const loadRelationAsArray = loadRelation instanceof Savable ? [loadRelation] : loadRelation

                    let {value, obj, lastKey: key} = await getValueByField(relation, this)
                    const valueAsArray = value instanceof Savable ? [value] : value
                    if (loadRelationAsArray){
                        const removedRefs = valueAsArray ? loadRelationAsArray.filter(ref => !valueAsArray.includes(ref)) : loadRelationAsArray
                        for (const ref of removedRefs){
                            try {
                                await ref
                            }
                            catch (e) {console.log('SYNC RELATIONS ERROR') }
                            if (ref[backRef] instanceof Array){
                                ref[backRef] = ref[backRef].filter(br => br._id !== this._id)
                            }
                            else {
                                ref[backRef] = null
                            }
                            noRefs || await ref.save(true)
                        }
                    }
                    if (valueAsArray){
                        for (const foreignSavable of valueAsArray){
                            await setBackRef(backRef, foreignSavable)
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

            const {_id, _empty, _ref, _loadRelations, then, ...toSave} = await recursiveSlicer(this)

            //TODO: UPSERT
            if (!this._id){ //first time
                const { insertedId } = await this.collection.insertOne(toSave)
                this._id = insertedId
            }
            else { //update
                await this.collection.updateOne({_id: this._id},  {$set: toSave}).catch(err => console.log('UPDATE ERR', err))
            }

            await syncRelations()
            this.saveRelations()
        }

        async delete(noRefs=false){
            if (!noRefs) for (const relation in this.__proto__.constructor.relations){
                const backRef = this.__proto__.constructor.relations[relation]

                const loadRelation = this._loadRelations && this._loadRelations[relation]
                const loadRelationAsArray = loadRelation instanceof Savable ? [loadRelation] : loadRelation

                if (loadRelationAsArray){
                    for (const ref of loadRelationAsArray){
                        try {
                            await ref
                        }
                        catch (e) {console.log('DELETE SYNC RELATIONS ERROR') }
                        if (ref[backRef] instanceof Array){
                            ref[backRef] = ref[backRef].filter(br => br._id !== this._id)
                        }
                        else {
                            ref[backRef] = null
                        }
                        await ref.save(true, true)
                    }
                }
            }
            const id  = this._id
            const col = this._class && this.collection

            for (let key in this)
                delete this[key]

            delete this.__proto__

            if (col)
                return await col.deleteOne({_id: id})
        }






        static isSavable(obj){
            return obj && obj._id && obj._class
        }

        static newSavable(obj, ref, empty=true){
            let className = obj._class || "Savable"
            if (obj.__proto__.constructor === Savable.classes[className]){
                return obj
            }
            
            return new Savable.classes[className](obj, ref, empty)
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
                            let cursorGen = asynchronize({s: cursor.stream(), 
                                                          chunkEventName: 'data', 
                                                          endEventName: 'close'})
                            for (const pObj of cursorGen()){
                                yield new Promise((ok, fail) => 
                                    pObj.then(obj => ok(Savable.newSavable(obj, null, false)), 
                                              err => fail(err)))
                            }
                        },
                        async findOne(query, projection){
                            let result = await db.collection(_class).findOne(query, projection)
                            if (result)
                                return Savable.newSavable(result, null, false)
                            return result
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
