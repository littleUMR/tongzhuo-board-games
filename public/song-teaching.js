(function(root){
 const concepts=[
  {title:'① 店铺：建成后反复赚钱',text:'这是店铺牌。先拿地契，再付造价建成。建成后留在“我的资产”；客人光顾它时，额外获得店铺收入。',selector:'[data-song-move="shop"]',image:'/assets/song/shop-wheel.png',card:true},
  {title:'② 菜谱：决定每道菜赚多少',text:'这是菜谱牌，和店铺是两种资产。招待时按客人的菜数抽菜谱：四品每道赚1两，三品赚2两。做过的菜谱进后厨，以后还会洗回再用。',selector:'[data-song-move="menu"][data-song-index="3"]',image:'/assets/song/menu-tofu.png',card:true},
  {title:'③ 客人：决定这一单怎么结算',text:'这是客人牌，不是买来持有的资产。菜数＝抽几张菜谱；光顾店铺＝哪些已建店额外赚钱。招待完客人离开，再补新客人。',selector:'[data-song-move="serve"]',image:'/assets/song/guest-scholar.png',card:true},
  {title:'三者怎样一起赚钱？',text:'举例：客人吃2道菜 → 抽两张菜谱赚3两 → 光顾已建关扑铺再赚2两，共5两。菜谱和店铺是赚钱工具，客人把收入触发出来。',selector:'.song-guest',image:'/assets/song/guest-scholar.png',relation:true},
  {title:'一个回合，依次做这3步',text:'① 购买营建：买牌、建店。② 备菜：可淘汰弱菜单。③ 招待：必须选一位客人，结算收入，再换人。',selector:'.song-phases',image:'/assets/song/shop-wheel.png',flow:true}
 ];
 const phases=[{id:'purchase',name:'① 购买／建店',detail:'最多买1张菜谱或地契；钱够可建多间。可不买、不建。'},{id:'prepare',name:'② 备菜',detail:'可花3两淘汰后厨1张菜单，也可跳过；至少留6张。'},{id:'serve',name:'③ 招待',detail:'必须招待1位客人，自动结算，再换人。买牌和备菜不能直接赚钱。'}];
 const data={concepts,phases};if(typeof module==='object')module.exports=data;else root.SONG_TEACHING=data;
})(typeof window==='object'?window:globalThis);
