// @ts-check

/** @typedef {{campaignId:string, characterId:string, sessionId:string}} CampaignContext */
/** @typedef {{context:CampaignContext, key:string, revision:number}} CampaignScope */
/** @typedef {{status:'snapshot', text:string, origin:{campaignId:string,id:string}|null}} CampaignSourceSnapshot */
/** @typedef {{name:string, description:string, relation:string|null}} CampaignPersonDetails */
/** @typedef {{id:string, text:string, kind:'known'|'assumption', sessionId:string|null, sessionSnapshot?:CampaignSourceSnapshot}} CampaignKnowledge */
/** @typedef {{id:string, text:string, sessionId:string|null, placeId:string|null, sessionSnapshot?:CampaignSourceSnapshot, placeSnapshot?:CampaignSourceSnapshot}} CampaignEncounter */
/** @typedef {'person'|'quest'|'place'|'session'} CampaignLinkKind */
/** @typedef {{kind:CampaignLinkKind,id:string}} CampaignLinkedTarget */
/** @typedef {CampaignLinkedTarget|{kind:CampaignLinkKind,id:null,snapshot:CampaignSourceSnapshot}} CampaignLink */
/** @typedef {CampaignPersonDetails & {id:string,createdSessionId:string,knowledge:CampaignKnowledge[],encounters:CampaignEncounter[],links:CampaignLink[],latestEncounterId:string|null}} CampaignPerson */
/** @typedef {CampaignPersonDetails & {id:string,createdSessionId:string,latestEncounter:CampaignEncounter|null}} CampaignPersonSummary */
/** @typedef {{revision:number,context:CampaignContext,person:CampaignPerson}} CampaignPersonResponse */
/** @typedef {{revision:number,context:CampaignContext,people:CampaignPersonSummary[]}} CampaignPeopleResponse */
/** @typedef {{id:string,text:string,sessionId:string|null}} CampaignKnowledgeFields */
/** @typedef {CampaignKnowledgeFields & {placeId:string|null}} CampaignEncounterFields */
/**
 * @typedef {{operation:'create',data:{details:CampaignPersonDetails,knowledge:CampaignKnowledge|null}} |
 * {operation:'edit',data:CampaignPersonDetails} |
 * {operation:'add-knowledge',data:CampaignKnowledge} |
 * {operation:'edit-knowledge',data:CampaignKnowledgeFields & {clearSnapshots?:'session'[]}} |
 * {operation:'add-encounter',data:CampaignEncounterFields & {makeLatest:boolean}} |
 * {operation:'edit-encounter',data:CampaignEncounterFields & {clearSnapshots?:('session'|'place')[]}} |
 * {operation:'choose-latest',data:{id:string|null}} |
 * {operation:'confirm-knowledge',data:{id:string}} |
 * {operation:'set-links',data:{links:CampaignLinkedTarget[]}} |
 * {operation:'remove-link-snapshot',data:{index:number}}} CampaignPersonChange
 */
/** @typedef {CampaignPersonChange & {campaignId:string, personId:string, mutationId:string, expectedRevision:number}} CampaignPersonCommand */
/** @typedef {{section:'overview'|'people'|'journal'|'actions',query:string,selectedId:string|null,scope:CampaignScope|null}} CampaignScreenState */
/** @typedef {{id:string,title:string,status:string,steps:{id:string,title:string,done:boolean}[]}} CampaignGoal */

const SkazCampaignModel=(()=>{
  const maxTransferBytes=8*1024*1024;

  /**
   * @param {CampaignScope} scope
   * @param {string} personId
   * @param {CampaignPersonChange} change
   * @param {string} mutationId
   * @returns {CampaignPersonCommand}
   */
  function command(scope,personId,change,mutationId){
    return {...change,campaignId:scope.context.campaignId,personId,mutationId,expectedRevision:scope.revision};
  }

  /** @param {CampaignGoal[]} quests */
  function currentGoals(quests){
    return quests.filter(quest=>quest.status==='active').slice(0,3)
      .map(({id,title,steps})=>({id,title,next:steps.find(step=>!step.done)?.title??null}));
  }

  /** @param {unknown} value */
  function transferPreview(value){
    if(!value||typeof value!=='object')return null;
    const file=/** @type {Record<string,any>} */ (value);
    if(file.app!=='skaz-campaign-memory'||file.ruleset!=='5e-2014'||file.schemaVersion!==1||
       file.game?.schemaVersion!==15||!Array.isArray(file.memory?.people)||
       !Array.isArray(file.memory?.archives)||typeof file.game.state?.profile?.campaign!=='string'||
       typeof file.game.state.profile.name!=='string')return null;
    return {name:file.game.state.profile.campaign,hero:file.game.state.profile.name,
      people:file.memory.people.length,archives:file.memory.archives.length};
  }

  /** @param {HTMLFormElement} form @returns {Record<string,string|boolean>} */
  function fields(form){
    /** @type {Record<string,string|boolean>} */
    const values={};
    for(const element of Array.from(form.elements)){
      if(element instanceof HTMLInputElement && element.name){
        values[element.name]=element.type==='checkbox'?element.checked:element.value;
      }else if((element instanceof HTMLTextAreaElement||element instanceof HTMLSelectElement)&&element.name){
        values[element.name]=element.value;
      }
    }
    return values;
  }

  /** @param {HTMLFormElement} form @param {Record<string,string|boolean>} values */
  function restore(form,values){
    for(const element of Array.from(form.elements)){
      if(!(element instanceof HTMLInputElement||element instanceof HTMLTextAreaElement||element instanceof HTMLSelectElement)||
         !element.name||!Object.hasOwn(values,element.name))continue;
      const value=values[element.name];
      if(element instanceof HTMLInputElement&&element.type==='checkbox')element.checked=value===true;
      else element.value=String(value);
    }
  }

  return {command,currentGoals,transferPreview,fields,restore,maxTransferBytes};
})();
