import {fileURLToPath} from 'node:url';
export async function scanWCAG(page,label){
 await page.addScriptTag({path:fileURLToPath(new URL('../node_modules/axe-core/axe.min.js',import.meta.url))});
 const result=await page.evaluate(()=>window.axe.run(document,{
  runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22a','wcag22aa']}
 }));
 return {screen:label,violations:result.violations.map(v=>({id:v.id,impact:v.impact,
  nodes:v.nodes.slice(0,8).map(n=>({target:n.target,why:n.failureSummary}))})),
  passedRules:result.passes.length,incompleteRules:result.incomplete.length};
}
