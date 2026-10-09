import { describe,it,expect } from 'vitest';
import { validateCloudRequest,orderTotal } from './cloud-validation';
import {isAllowedCity,isValidCep} from './cep';

describe('Cloud security and order rules',()=>{
  it('rejects updates without a specific delivery',()=>{
    expect(()=>validateCloudRequest({table:'deliveries',operation:'update',values:{status:'entregue'}})).toThrow();
  });
  it('rejects unrestricted deletes',()=>{
    expect(()=>validateCloudRequest({table:'clientes',operation:'delete',filters:[]})).toThrow();
  });
  it('does not reset the address when marking delivered',()=>{
    const result=validateCloudRequest({table:'deliveries',operation:'update',filters:[{column:'id',value:'test',kind:'eq'}],values:{status:'entregue'}});
    expect(result.values).toEqual({status:'entregue'});
  });
  it('charges exactly R$ 8 for delivery',()=>{
    expect(orderTotal([{preco:12.5,qtd:2}],'entrega')).toBe(33);
  });
  it('does not charge delivery on pickup',()=>{
    expect(orderTotal([{preco:12.5,qtd:2}],'retirada')).toBe(25);
  });
  it('only accepts Umuarama PR',()=>{
    expect(isAllowedCity('Umuarama','PR')).toBe(true);
    expect(isAllowedCity('São Paulo','SP')).toBe(false);
  });
  it('requires a complete postal code',()=>{
    expect(isValidCep('87511')).toBe(false);
    expect(isValidCep('87511-130')).toBe(true);
  });
});