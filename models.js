// Каталог моделей qwerty. Чтобы добавить свою: скопируй любую строку, поменяй id, name, url.
// cat: chars (персонажи), animals (животные), veh (транспорт), props (предметы), city (город)
// size: во сколько метров по самой длинной стороне сделать модель
(()=>{
const R3='https://cdn.jsdelivr.net/gh/mrdoob/three.js@r147/examples/models/gltf/';
const KH='https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/';
window.QW_MODELS=[
 // персонажи
 {id:'robot',cat:'chars',name:'Робот',icon:'🤖',url:R3+'RobotExpressive/RobotExpressive.glb',size:1.8,note:'CC0 · 14 движений'},
 {id:'cman',cat:'chars',name:'Ходок',icon:'🚶',url:KH+'CesiumMan/glTF-Binary/CesiumMan.glb',size:1.8,note:'CC-BY · ходьба'},
 {id:'brain',cat:'chars',name:'Робот-рука',icon:'🦾',url:KH+'BrainStem/glTF-Binary/BrainStem.glb',size:1.8,note:'CC-BY · анимация'},
 {id:'soldier',cat:'chars',name:'Солдат',icon:'🪖',url:R3+'Soldier.glb',size:1.8,note:'Mixamo · idle/walk/run'},
 {id:'xbot',cat:'chars',name:'Икс-бот',icon:'🕺',url:R3+'Xbot.glb',size:1.8,note:'Mixamo · много поз'},
 {id:'michelle',cat:'chars',name:'Танцорка',icon:'💃',url:R3+'Michelle.glb',size:1.7,note:'Mixamo · танец'},
 // животные
 {id:'fox',cat:'animals',name:'Лиса',icon:'🦊',url:KH+'Fox/glTF-Binary/Fox.glb',size:1.1,note:'CC0 · стоит/идёт/бежит'},
 {id:'horse',cat:'animals',name:'Лошадь',icon:'🐴',url:R3+'Horse.glb',size:2.2,note:'CC-BY · галоп'},
 {id:'flamingo',cat:'animals',name:'Фламинго',icon:'🦩',url:R3+'Flamingo.glb',size:1.4,note:'CC-BY · полёт'},
 {id:'parrot',cat:'animals',name:'Попугай',icon:'🦜',url:R3+'Parrot.glb',size:.8,note:'CC-BY · полёт'},
 {id:'stork',cat:'animals',name:'Аист',icon:'🕊',url:R3+'Stork.glb',size:1.4,note:'CC-BY · полёт'},
 // транспорт
 {id:'truck',cat:'veh',name:'Грузовик',icon:'🚚',url:KH+'CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb',size:4.5,note:'CC-BY · колёса крутятся'},
 {id:'buggy',cat:'veh',name:'Багги',icon:'🏎',url:KH+'Buggy/glTF-Binary/Buggy.glb',size:3.5,note:'свободная'},
 {id:'toycar',cat:'veh',name:'Игрушечная машина',icon:'🚗',url:KH+'ToyCar/glTF-Binary/ToyCar.glb',size:3,note:'CC-BY'},
 {id:'ferrari',cat:'veh',name:'Ferrari',icon:'🏁',url:R3+'ferrari.glb',size:4.5,note:'CC-BY'},
 // предметы
 {id:'duck',cat:'props',name:'Утка',icon:'🦆',url:KH+'Duck/glTF-Binary/Duck.glb',size:.7,note:'свободная'},
 {id:'lantern',cat:'props',name:'Фонарь',icon:'🏮',url:KH+'Lantern/glTF-Binary/Lantern.glb',size:1.2,note:'CC0'},
 {id:'bottle',cat:'props',name:'Бутылка',icon:'🧴',url:KH+'WaterBottle/glTF-Binary/WaterBottle.glb',size:.4,note:'CC0'},
 {id:'boombox',cat:'props',name:'Магнитофон',icon:'📻',url:KH+'BoomBox/glTF-Binary/BoomBox.glb',size:.5,note:'CC0'},
 {id:'camera',cat:'props',name:'Старая камера',icon:'📷',url:KH+'AntiqueCamera/glTF-Binary/AntiqueCamera.glb',size:.6,note:'CC-BY'},
 {id:'chair',cat:'props',name:'Кресло',icon:'🪑',url:KH+'SheenChair/glTF-Binary/SheenChair.glb',size:1,note:'CC-BY'},
 {id:'avocado',cat:'props',name:'Авокадо',icon:'🥑',url:KH+'Avocado/glTF-Binary/Avocado.glb',size:.2,note:'CC0'},
 // город
 {id:'vcity',cat:'city',name:'Виртуальный город',icon:'🌇',url:KH+'VC/glTF-Binary/VC.glb',size:16,note:'CC-BY · большой'},
 {id:'tokyo',cat:'city',name:'Крошечный Токио',icon:'🏙',url:R3+'LittlestTokyo.glb',size:9,note:'CC-BY · с анимацией'}
];
})();
