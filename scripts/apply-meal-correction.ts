import {resolve} from 'node:path';
import {ReadingStore} from '../src/server/reading/store';
import {applyApprovedMealCorrection} from '../src/server/reading/meal-correction';
const directory=process.argv[2];if(!directory||resolve(directory)!==directory||!directory.endsWith('/reading')||!process.argv.includes('--apply-approved-correction'))throw Error('Specify an absolute reading directory and --apply-approved-correction after backing up.');const store=new ReadingStore(directory);try{console.log(JSON.stringify(applyApprovedMealCorrection(store)));}finally{store.close();}
