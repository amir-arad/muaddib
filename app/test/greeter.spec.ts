import container from "../src/config/ioc_config";
import Battle from '../src/interfaces/battle';
import SERVICE_IDENTIFIER from '../src/constants/identifiers';
import {expect} from 'chai';

describe('app', () => {
    // simple unit test example
    it('battle fights correctly', ()=>{
        let epicBattle = container.get<Battle>(SERVICE_IDENTIFIER.BATTLE);
        expect(epicBattle.fight()).to.equal(`FIGHT!
                Ninja (Shuriken)
                vs
                Samurai (Katana)`);
    });
});
