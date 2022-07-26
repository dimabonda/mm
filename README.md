# mm

[MemMongo - transparent engine for objects graph storage in mongo](http://doc.a-level.com.ua/asmer-memmongo)
===

`DONE` Proof-Of-Concept
---

Если объект унаследован от `Saveable`, то метод save прототипа:
- `DONE` сохраняет в коллекцию по имени класса
- `DONE` рекурсивно обходит всё что видит в объекте, и:
- `DONE` если это просто объект - пытается его заджсонить и сохранить,
- `DONE` если это `Saveable`, то выколупывает из него `_id` (возможно, сохраняя в первый раз) и кладет в базу `ObjectID` вместо самого объекта.


**Так же:**

- `DONE` скрытые обязательные поля для сохранения в `Savable`: `_id` и `_class` (он будет коллекцией `mongo`). При получении объекта  
  `Savable` из монги каждый объект-ссылка из полученного с `_id` и `_class` будет вычитан как "пустой" наследник `_class` (и `Savable`), 
  который заполнит `this` при await и вернет его.
- `CANCELLED` все объекты `Saveable` с `objectid` хранятся в общем identity weakmap
- `DONE` любой `Saveable` может быть `await`-нут бо в нём будет `then`. И это будет стандартная практика на случай если данных
  сейчас в раме нет. В `then`:
    - проверяется есть ли объект в памяти, если что резолвимся сразу 
    - если объекта нет, то по `_id` он вычитывается и всё сгружается в `this`. Найденные ссылки на другие объекты инстанциируются без данных.
    - в `resolve` передается `this`
- `DONE` в прототипе предусмотреть монговские `find*` с тупо json-запросом. Так же параметром передавать нужный вложенности для выборки.



v2
---
### `DONE` Relations
- `DONE` статическим геттером в классе предусмотреть конфигурацию синхронизации связей: 
```javascript
    static get relations() { 
        return { field: foreignField, 
                 field2: foreignField2 }
    }
```
   если `field` - `Saveable`, то для синхронизации надо сходить в `field` и там найти `foreignField`, 
   в который установить (если 1к1) или добавить/проверить наличие связи с `this`. Если же массив, 
   то сделать тоже самое для каждого элемента
    - использовать Set для хранения множеств связей (что бы избежать дублей)
    - `DONE` **ПРИ УДАЛЕНИИ** связей будет не ясно, у кого удалять ответную. В таком случае можно  хранить стартовые состояния связей и 
        потом искать пересечения, разности и т. п.
    - это не обязательно, но нужно для автоматизации изотропных связей. однонаправленные похуй
    
### `DONE` Permission model filtering
Кому можно:
    - роли
    - группы
    - пользователи
    - Владелец


Что можно:
    - CRUD
    - Дать/убрать доступ


Как:
    - массив с:
        - userId,
        - role
        - groupId


    для каждого права доступа.


Отдельная таблица для групп, которая может включать в себя иные роли, группы и юзеров

v2.5
----
После тестирования, наблюдения:
- Нужны классы/функции типа генериков для _данных связи_ (m2m). Иначе приходится в ER 
    стиле делать промежуточную модель для хранения инфы о связи. 
    - **DONE** Запилить `shortData`, реализуемый методом а-ля `toString`, который будет генерировать
        _короткую форму_ для объекта. Удобно для предпросмотра связей без выборки данных, 
        а так же там были бы уместны пермишены, дабы фильтровать связи до выборки связанных
        данных в случае отсутствия прав доступа к связанным данным;
    - Запилить `relationData`, которая зависит не от одного из объекта связи, а от
        _обоих_ (поэтому это схоже с генериками **CL**). Однако при этом _обе связи
        (прямая и обратная) хранят одинаковые данные_, `Savable` должен это синкать;
- **Identity Map** не уместен на уровне `Savable` (или уместен??) однако очень в тему на уровне
    `SlicedSavable`. Это оптимизирует запросы и вопросы одновременного редактирования
```javascript
    class User extends Savable {
        constructor(...params){
            super(...params)

            this.userActions = this.userActions instanceof Array ? this.userActions : (this.userActions ? [this.userActions] : []) 
            this.repoActions = this.repoActions instanceof Array ? this.repoActions : (this.repoActions ? [this.repoActions] : []) 
        }

        static get relations(){
            return {
                student: "user",
                teacher: "user",
                userActions: "user",
                repoActions: "repoUser"
            }
        }
    }
    Savable.addClass(User)

    class Action extends Savable {

        static get relations(){
            return {
                user: "userActions",
                repoUser: "repoActions"
            }
        }
    }
    Savable.addClass(Action)





        let aUser    = await Savable.m.User.findOne({"gogs.id": a.act_user_id})
        a.___permissions = {
            read: []
        }
        if (aUser) {
            console.log(`action user ${aUser.gogs.username}`)
            a.user = aUser
            a.___owner = aUser._id.toString();
            a.___permissions.read.push('owner')
        }
        let repoUser = (a.user_id === a.act_user_id ? 
                                              aUser : await Savable.m.User.findOne({"gogs.id": a.user_id}))
        if (repoUser) {
            console.log(`repo user ${repoUser.gogs.username}`)
            a.repoUser = repoUser
            a.___permissions.read.push(repoUser._id.toString())
        }
        await a.save()
```

    Здесь имеется две связи один-ко-многим между пользователем и действиями на гите. Одна связь - много действий _пользователя_ (`aUser),
    вторая - много действий _над пользовательским репо_ (`repoUser`).
    
    без строки
```javascript
        let repoUser = (a.user_id === a.act_user_id ? 
                                              aUser : await Savable.m.User.findOne({"gogs.id": a.user_id}))
```
    происходит рассинхрон в случае когда пользователь репо и пользователь активности один и тот же (а так почти всегда кроме кооперативных
    коммитов и issue к чужому репо) - на момент выборки `repoUser` связи с активностью еще в пользователе нет. 
    
    Данная строка является локальным костылем.

- **Change detect**, `$set` and so.
    При наличии **Identity Map** не очень актуально, но:
    - Для уменьшения проблем синхронизации данных при одновременном мутировании записей
        было бы неплохо изменять документ кусками, отмечая diff используя `Proxy`/**getter-setter**. Однако это несет дополнительное
        снижение производительности
    - Это позволит синхронизировать связи при отсутствии прав доступа к удаленной модели более красиво и безопасно.
- `SlicedSavable` bugs:
    - **DONE** Права доступа на связанную сущность:
        - Фильтровать связь или нет, при отсутствии доступа? Не будет ли обновление объекта пускать по пизде _полный массив связей_
            с частично невидимыми сущностями.
        - Надо редактировать связи без доступа прозрачным способом (сейчас там выключена проверка по `noRef`)
        - Решено через заведение `guestRelations` - массива связей в модели, в которую можно писать со стороны, а так же добавлением
            пары методов `setRelation` и `removeRelation`, которые не используют `save`, но пишут _только связи_ в базу.

## v2.6
### Identity Map
На уровне Savable. использовать объект `Map`, ключи - строки `_id`, значения - пара объектов:
    - Собственно `Savable`
    - Объект-копия текущего состояния в СУБД.


**Это позволит:**
    - Чистка **Identity Map**:
        - Итерируем `identityMap` пока его размер не станет меньше порога,
            - Если объект сохранен (функция "грязноты" записи) (состояние в памяти соответствует копии состояния **СУБД**)
                - Чистим:
                    - Удаляем запись из `identityMap`,
                    - переводим объект в пустое состояние
            - Иначе пропускаем
    - При загрузке объекта (не важно, из ссылки-пустышки, или через `find*`):
        - Ищем в `identityMap`, 
        - Если находим, то подставляем существующий, и:
            - _удаляем сущность из `identityMap`_
            - _добавляем сущность в `identityMap`_. Это нужно что бы сущность оказалась
                **внизу списка** `identityMap`.
    - При сохранении:
        - обновляем копию состояния **CУБД**
        - используем `$set` (в идеале)
    - Запилить функцию проверки грязноты записи.
    
### Relations
    - Для массивов связей гарантировать только уникальную ссылку (а-ля `Set`), использовать
        mongo-приколы типа `$addToSet`
    -  `DONE` (называется `guestRelations`) Права доступа на связь: хозяйская (картинки к постам), или же чужая (комменты к постам, лайки к постам)
```javascript
default get relationsWriteable {
    return ["comments", "likes"] //post.comments and post.likes writable by owners of comments or likes
}
```
    - `DONE` Сделать `setRef`, метод для записи связей без изменения остальной записи при отсутствии прав на запись, но есть
    права на связь. Так же метод хорош для вынесения ада syncRelations в два метода - местный, и набор вызовов setRef в связях
    если что-то поменялось
    
    
            


    
    


v3
----

### Cache

- `updatedAt`, нужен для мониторинга изменений(?)
- flag `_cacheble`,  возможно не обязательный в СУБД, но должен быть в каждом объекте в JS runtime.  
    По умолчанию `false`.  При наличии true, в базе кроме `_id` и `_class` сохраняется всё остальные поля целиком в 
    кэширующем объекте. Например, в `Post.owner` будет весь объект пользователя-создателя, а не только его `_id` и `_class`)
- инвалидация:
    - Кэшируемая модель может хранить массив ссылок кэширующих моделей.
    - Можно использовать в кэширующей модели метку времени кэширования/время сохранения кэшируемой модели и тот или иной TTL    - 
    
### onChange

повесится на монго изменение для синхронизации с памятью при надобности. Это позволит актуализировать `Savable`, находящиеся в памяти
при изменении их в базе. При наличии **identity weak map** поиск экземпляра в памяти не составит труда.

v4
----

Far future

### Big Many relations
Не влазящие массивы можно перекидывать в отдельные коллекции. В месте невлезания вместо массива хранить объект с именем
коллекции. 
