(function(root){
 const scenes={
  road:[{id:'A',x:0,y:0,rotation:3},{id:'U',x:1,y:0,rotation:1},{id:'A',x:2,y:0,rotation:1}],
  city:[{id:'E',x:0,y:0,rotation:2},{id:'E',x:0,y:1,rotation:0}],
  regions:{road:{name:'道路',tile:'D',anchor:[.5,.5],text:'道路每块1分。两端封住后计分，随从回来。',note:'尽头可以是修道院、路口或城市，也可以连成环。'},city:{name:'城市',tile:'D',anchor:[.5,.1],text:'城墙围满、没有缺口就完成：每块2分，每个盾徽再加2分。',note:'未完成的城市留到终局，每块和每个盾徽各1分。'},monastery:{name:'修道院',tile:'A',anchor:[.5,.5],text:'周围八格都拼上地块，就得到9分，随从回来。',note:'终局没围满，也按自身＋周围已有地块计分。'},field:{name:'田野',tile:'D',anchor:[.5,.725],text:'农夫躺在田里，直到终局才计分，不会中途回来。',note:'这片田每接触一座已完成城市得3分；同一座城不重复计算。'}}
 };
 if(typeof module==='object')module.exports=scenes;else root.LESSON_SCENES=scenes;
})(typeof window==='object'?window:globalThis);
