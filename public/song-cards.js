const SONG_CARDS={"shops":[{"id":"wheel","name":"关扑铺","cost":5,"income":2,"rule":"每次光顾收入 2 两","art":"shop-wheel"},{"id":"fortune","name":"卦肆","cost":6,"income":"die","rule":"每次光顾掷骰，收入等于点数","art":"shop-fortune"},{"id":"theatre","name":"勾栏瓦肆","cost":8,"income":"buildings","rule":"收入等于自己已建店铺数","art":"shop-theatre"},{"id":"jewelry","name":"首饰铺","cost":5,"income":2,"rule":"每次光顾收入 2 两","art":"shop-jewelry"}],"menus":[{"grade":4,"name":"时蔬饭","cost":0,"income":"1 两","art":"menu-rice"},{"grade":3,"name":"黄金豆腐","cost":3,"income":"2 两","art":"menu-tofu"},{"grade":2,"name":"清蒸鲜鱼","cost":6,"income":"3 两","art":"menu-fish"},{"grade":1,"name":"蟹黄珍馐","cost":9,"income":"2 两＋骰子点数","art":"menu-crab"}]};
SONG_CARDS.shops.push(...[
 ['tea','茶肆',5,2,'有说书场时，每次光顾额外收入2两'],['wine','酒肆',6,3,'有说书场时，每次光顾额外收入2两'],['drink','饮子铺',4,1,'有说书场时，每次光顾额外收入2两'],['story','说书场',7,2,'联动：茶肆、酒肆、饮子铺各加2两'],['book','书坊',5,2,'有茶肆时，每次光顾额外收入2两'],['porcelain','瓷器铺',6,3,'有首饰铺时，每次光顾额外收入1两'],['silk','绸缎庄',7,3,'有首饰铺时，每次光顾额外收入1两'],['cuju','蹴鞠场',6,3,'每次光顾收入3两']
].map(([id,name,cost,income,rule])=>({id,name,cost,income,rule:rule.startsWith('每次')?rule:'每次光顾收入'+income+'两；'+rule,art:'shop-'+id})));
SONG_CARDS.shops[0].rule+='；有饮子铺时额外加1两';
SONG_CARDS.shops[1].rule+='；有关扑铺时额外加2两';
SONG_CARDS.shops.forEach(s=>s.art='piece-'+s.id);
SONG_CARDS.events=[
 {id:'lantern',name:'上元灯会',rule:'本轮每单店铺总收入额外加2两',shop:2},
 {id:'harvest',name:'丰年好景',rule:'本轮每道菜额外收入1两',dish:1},
 {id:'rain',name:'春雨润城',rule:'本轮每单赠送1两雨中茶钱',bonus:1},
 {id:'feast',name:'汴京宴饮',rule:'本轮每单菜品总收入额外加3两',food:3},
 {id:'market',name:'商会集市',rule:'立即为每位东家发放2两商会津贴',grant:2},
 {id:'opera',name:'瓦肆盛会',rule:'本轮每家被光顾的店铺额外加1两',visit:1},
 {id:'festival',name:'重阳佳节',rule:'本轮每单额外收入2两',bonus:2},
 {id:'fair',name:'百商会聚',rule:'立即为每位东家发放1两',grant:1},
 {id:'gourmet',name:'食客云集',rule:'本轮每单菜品总收入额外加2两',food:2}
];
SONG_CARDS.dishes={4:['时蔬饭','炊饼','素面'],3:['黄金豆腐','莲藕汤','煎鱼饼'],2:['清蒸鲜鱼','东坡肉','莲子羹'],1:['蟹黄珍馐','八宝鸭','锦绣宴']};
if(typeof module!=='undefined')module.exports=SONG_CARDS;
