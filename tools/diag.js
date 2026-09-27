const S=require("D:/AI/YashAITech/products/architecture-lab/sim.js"),X=require("D:/AI/YashAITech/products/architecture-lab/examples_more.js");
const names=process.argv.slice(2);
for(const e of X.LIST){ if(names.length&&!names.some(n=>e.name.startsWith(n)))continue; const g=X.build(e,S.BY_ID),r=S.run(g,e.scenario,[]);const peak={};r.st.history.forEach(h=>Object.entries(h.nodes).forEach(([id,v])=>{peak[id]=Math.max(peak[id]||0,v.util||0)}));
console.log(e.name, "|", g.nodes.map(n=>n.id+":"+n.type+"="+(peak[n.id]||0).toFixed(2)).join(" "));}
