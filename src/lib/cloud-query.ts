import { cloudQuery } from './cloud.functions';
import type { z } from 'zod';
import type { cloudRequestSchema } from './cloud-validation';
type Request = z.infer<typeof cloudRequestSchema>;
type Result = {data: Record<string,unknown>[] | Record<string,unknown> | null; error:{message:string;code?:string}|null};

export function protectedTable(table: Request['table']) {
  const request: Request = {table,operation:'select',filters:[]};
  const orders: {column:string;ascending:boolean}[] = [];
  let single = false;
  let signal: AbortSignal | undefined;
  const builder = {
    select(_columns?:string) { return builder; },
    insert(values:Record<string,unknown>) {request.operation='insert';request.values=values;return builder;},
    update(values:Record<string,unknown>) {request.operation='update';request.values=values;return builder;},
    upsert(values:Record<string,unknown>,_options?:unknown) {request.operation='upsert';request.values=values;return builder;},
    delete() {request.operation='delete';return builder;},
    eq(column:string,value:string|boolean|null) {request.filters.push({column,value,kind:'eq'});return builder;},
    is(column:string,value:null) {request.filters.push({column,value,kind:'is'});return builder;},
    order(column:string,options?:{ascending?:boolean}) {orders.push({column,ascending:options?.ascending ?? true});return builder;},
    maybeSingle() {single=true;return builder;},
    abortSignal(value:AbortSignal) {signal=value;return builder;},
    async then<TResult1 = Result,TResult2 = never>(resolve?:((value:Result)=>TResult1|PromiseLike<TResult1>)|null,reject?:((reason:unknown)=>TResult2|PromiseLike<TResult2>)|null):Promise<TResult1|TResult2> {
      try {
        signal?.throwIfAborted();
        const result = await cloudQuery({data:request});
        signal?.throwIfAborted();
        let rows = result.data;
        if (rows) rows = [...rows].sort((a,b)=>{
          for (const o of orders) {
            const av=a[o.column],bv=b[o.column];
            const compared = typeof av==='number' && typeof bv==='number' ? av-bv : String(av??'').localeCompare(String(bv??''));
            if (compared) return o.ascending?compared:-compared;
          }
          return 0;
        });
        const output:Result = {data:single?rows?.[0]??null:rows,error:result.error};
        return resolve ? resolve(output) : output as TResult1;
      } catch (error) {
        if (reject) return reject(error);
        throw error;
      }
    },
  };
  return builder;
}