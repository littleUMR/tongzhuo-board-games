// Competition ranking: tied players share a rank and skip the next rank.
function rewards(gameId,players){
 const incan=gameId==='incangold',won=p=>gameId==='song'&&p.shopCount>=8&&p.score>=50,compare=(a,b)=>Number(won(b))-Number(won(a))||b.score-a.score||(incan?(b.artifacts?.length||0)-(a.artifacts?.length||0):0);
 const sorted=[...players].sort(compare),top=sorted[0].score,bottom=sorted.at(-1).score;
 return sorted.map(p=>{const rank=1+sorted.filter(q=>compare(q,p)<0).length,n=players.length;
  const base=Math.round((incan?35:30)+(incan?105:90)*(n-rank)/Math.max(1,n-1));
  const gapBonus=Math.min(30,Math.floor((p.score-bottom)/(incan?2:5)));
  return {playerId:p.id,name:p.name,rank,score:p.score,base,gapBonus,coins:base+gapBonus,gapToFirst:top-p.score};
 });
}
module.exports={rewards};
