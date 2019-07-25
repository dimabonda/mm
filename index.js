const { MongoClient, ObjectID }  = require("mongodb");
const {asynchronize, openPromise } = require('./asynchronize')

const mm = db => {
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
                //TODO: list of callbacks, because then can be called many times, and
                //it's not reason to repeat query to db
                this.then = (cb, err) => {

                    if (!this._id)    err(new ReferenceError('Id is empty'))
                    if (!this._class) err(new ReferenceError('Class is empty'))

                    const promise = openPromise()

                    this.collection.findOne(this._id).then( data => {
                        if (!data){
                            err(new ReferenceError('Document Not Found'))
                        }
                        else {
                            delete this.then
                            this.populate(data)
                            if (typeof cb === 'function')
                                promise.resolve(cb(this))
                            else {
                                promise.resolve(this)
                            }
                        }
                    })
                    return promise
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
            if (this.empty) return this;

            const syncRelations = async () => {
                if (noSync) return
                if (!(this && this.__proto__ && this.__proto__.constructor && this.__proto__.constructor.relations)) return 


                async function getValueByField(field, savable) {
                    let path = field.split('.');
                    await savable//.catch(e => console.log('GET VALUE BY FIELD ERROR'));
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
                        if (!Savable.existsInArray(backRefValue, this)){
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
                        const removedRefs = valueAsArray ? 
                                loadRelationAsArray.filter(ref => !Savable.existsInArray(valueAsArray, ref)) : 
                                loadRelationAsArray
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
            return this
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





        static existsInArray(arr, obj){
            let filtered = arr.filter(item => !item._id || !obj._id || item._id.toString() === obj._id.toString())
            return filtered.length
        }

        static isSavable(obj){
            return obj && obj._id && obj._class
        }

        static newSavable(obj, ref, empty=true){
            let className = obj._class || "Savable"
            className     = Savable.classes[className] ? className : "Savable"
            if (obj.__proto__.constructor === Savable.classes[className]){
                return obj
            }
            
            return new Savable.classes[className](obj, ref, empty)
        }

        static addClass(_class){ //explicit method to add class to Savable registry for instantiate right class later
            (typeof _class == 'function') && (Savable.classes[_class.name] = _class)
        }


        static get m(){
            return new Proxy({}, {
                get(obj, _class){
                    if (_class in obj){
                        return obj[_class]
                    }

                    return  obj[_class] = {
                        * find(query, projection, cursorCalls={}){
                            let cursor = db.collection(_class).find(query, projection)
                            for (let [method, params] of Object.entries(cursorCalls)){
                                if (typeof cursor[method] !== "function"){
                                    throw new SyntaxError(`Wrong cursor method ${method}`)
                                }

                                cursor = cursor[method](...params)
                            }
                            let cursorGen = asynchronize({s: cursor.stream(), 
                                                          chunkEventName: 'data', 
                                                          endEventName: 'close',
                                                          errEventName: 'error',
                                                          countMethodName: 'count'})

                            for (const pObj of cursorGen()){
                                yield new Promise((ok, fail) => 
                                    pObj.then(obj => (/*console.log(obj),*/ok(Savable.newSavable(obj, null, false))), 
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

    /**
     * sliceSavable - slice (limit) Savables for some permission
     * Array userACL - array of objectIDs, words or savable refs - current user, group objectid, or `tags` or `role` (ACL)
     */

    function sliceSavable(userACL){
        userACL = userACL.map(tag => tag.toString())
        //console.log(userACL)
        class SlicedSavable extends Savable {
            constructor(...params){
                super  (...params)

                if (!this._empty){
                    this.___permissionsPrepare()
                }
            }

            ___permissionsPrepare(){
                if (this._empty)          return
                if (!this.___permissions) this.___permissions = {}

                for (let [perm, acl] of Object.entries(this.__proto__.constructor.defaultPermissions)){
                    if (!this.___permissions[perm]){
                        this.___permissions[perm] = [...acl]
                    }
                }
            }

            ___permissionCan(permission, permissions=this.___permissions, obj=this){
                const acl = (permissions && 
                                permissions[permission] || 
                                    this.__proto__.constructor.defaultPermissions[permission]).map(tag => tag.toString())
                if (acl.includes('owner') && obj.___owner && userACL.includes(obj.___owner.toString())){
                    return true
                }
                for (let uTag of userACL){
                    if (acl.includes(uTag)){
                        return true
                    }
                }
                return false
            }

            populate(obj){ //place to check read permission
                //console.log(obj)
                if (!this.___permissionCan('read', obj.___permissions, obj)){
                    throw new ReferenceError(`No Access To Entity ${this._id} of class ${this._class}`)
                }
                super.populate(obj)
            }


            async save(noRefs=false, noSync=false){
                if (!this._id && !this.___permissionCan('create'))
                    throw new ReferenceError(`Permissison denied Create Entity of class ${this._class}`)
                if (this._id && !this.___permissionCan('write') && !noRefs) //give ability to change backrefs for not permitted records
                    throw new ReferenceError(`Permissison denied Save Entity ${this._id} of class ${this._class}`)

                if (!this._id){
                    this.___owner = userACL[0] //TODO fix objectid troubles 
                    //console.log(typeof this.___owner, this.___owner)
                }
                return await super.save(noRefs, noSync)
            }


            async delete(noRefs=false){
                if (!this.___permissionCan('delete'))
                    throw new ReferenceError(`Permissison denied Delete Entity ${this._id} of class ${this._class}`)
                return await super.delete(noRefs)
            }

            static ___permissionQuery(permission){
                //const withObjectIDs = userACL.map((a,id) => (id = new ObjectID(a)) && id.toString() === a ? id : a)
                const withObjectIDs = userACL
                return {
                    $or: [
                          {[`___permissions.${permission}`]: {$in: withObjectIDs}},
                          {$and: [{[`___permissions.${permission}`]: "owner"},
                                             {___owner: userACL[0]}]}]
                    }
                }

            static get m() {
                return new Proxy({}, {
                        get(obj, _class){
                                if (_class in obj){
                                        return obj[_class]
                                }

                                return  obj[_class] = {
                                    * find(query, projection, cursorCalls={}){
                                        const originalClass = Savable.classes[_class]
                                        Savable.addClass(SlicedSavable.classes[_class])
                                        let permittedQuery = {$and: [SlicedSavable.___permissionQuery('read') ,query]}
                                        //console.log(JSON.stringify(permittedQuery, null, 4))
                                        let iter = Savable.m[_class].find(permittedQuery, projection, cursorCalls)
                                        Savable.addClass(originalClass)
                                        yield* iter;
                                    },
                                    async findOne(query, projection){
                                        const originalClass = Savable.classes[_class]
                                        Savable.addClass(SlicedSavable.classes[_class])
                                            
                                        const permittedQuery = {$and: [SlicedSavable.___permissionQuery('read') ,query]}
                                        const p = Savable.m[_class].findOne(permittedQuery, projection)
                                        Savable.addClass(originalClass)
                                        
                                        return await p;
                                    }
                                }
                        },

                        set(obj, propName, value){
                        }
                })
            }

                static get defaultPermissions(){
                        return {
                                //savable refs, objectid's, words like 'tags' or 'roles'
                                read: ['owner', 'user'],
                                write: ['owner', 'admin'],
                                create: ['user'],
                                delete: ['admin'],

                                /*permission
                                 * TODO: permissions for read and write permissions
                                 *
                                 */
                        }
                }
        }

        return SlicedSavable
    }


    return {Savable, sliceSavable}
}

async function connect(dbName, dsn="mongodb://localhost:27017/"){
    if (!dbName)
        throw new ReferenceError(`db name does not provided`)

    const mongoClient = new MongoClient(dsn, { useNewUrlParser: true });
    const client      = await mongoClient.connect()
    const db          = client.db(dbName)
    const Savable     = mm(db).Savable
    const slice       = mm(db).sliceSavable 

    return {
        Savable, 
        slice,
    }
}

module.exports = {
    mm,
    connect
}
