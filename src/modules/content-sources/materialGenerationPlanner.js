const {getSpecification}=require('./toeicMaterialSpecifications');

const allocate=(total,parts,index)=>Math.floor(total/parts)+(index<total%parts?1:0);
function difficultyFor(quantity,mix){
  const basic=Math.floor(quantity*Number(mix.BASIC||0)/100),advanced=Math.floor(quantity*Number(mix.ADVANCED||0)/100);
  return {BASIC:basic,INTERMEDIATE:quantity-basic-advanced,ADVANCED:advanced};
}
function planBatches(item){
  const spec=getSpecification(item),quantity=Math.max(1,Number(item.quantity)||1),total=Math.ceil(quantity/spec.batchSize);
  return Array.from({length:total},(_,index)=>{const count=allocate(quantity,total,index);return {index:index+1,total,quantity:count,difficulty:difficultyFor(count,item.difficultyMix||{})};});
}
module.exports={planBatches,difficultyFor};
