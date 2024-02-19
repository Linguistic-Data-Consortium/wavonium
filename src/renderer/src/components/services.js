import { getp, postp } from 'ldcjs/src/getp';
import { getSignedUrlPromise, putObject } from 'ldcjs/src/aws_helper';
import { add_audio_to_list, add_audio_to_listq } from './modification1';

function round_to_6_places(num) {
  return Math.round(num * 1000000) / 1000000;
}


const base = '';
function get_promises(set_sp, set_op, o){
  let service_promise;
  let output_promise;
  let interval;
  const get_service_promise = (o) => {
    service_promise = postp(base + '/promises', o);
    set_sp(service_promise);
    service_promise.then( (o) => {
      interval = setInterval( () => get_output_promise(o), 1000);
    } );
  };
  const get_output_promise = (o) => {
    service_promise = getp(base + '/promises/' + o.id);
    set_sp(service_promise);
    service_promise.then( (o) => {
      if(o.status == 'resolved'){
        clearInterval(interval);
        output_promise = getp(o.data[0].output).then( (x) => JSON.parse(x) );
        set_op(output_promise);
        console.log('done');
      }
      else{
        console.log('waiting');
        console.log(o)
      }
    } );
  };
  get_service_promise(o);
}

function add_sad(k){
  if(window.ldc.resources.bucket){
    const bucket = window.ldc.resources.bucket;
    let key = k; //.replace('10s.wav', '5s.wav')
    if(key.startsWith("s3://")){
      const idx = key.indexOf(bucket) + bucket.length + 1;
      key = key.substring(idx);
    }
    return getSignedUrlPromise(bucket, key);
  }
}

async function add_sad_send(x){
  let p = add_sad(x);
  let p2 = p.then( (url) => {
    const o = { type: 'sad', data: { audio: url } };
    return window.sad(o, function(data) {
        return check_channels(data);
    } );
  } );
  return p2;
}

function check_channels(data) {
  const o = {
    ch1: [],
    ch2: []
  }
  // new format
  // or coincidentally old and short
  if(data.length === 1 || data.length === 2){
    o.ch1 = data[0];
    // check for old format
    if(o.ch1.length === 3 && typeof o.ch1[2] === 'string'){
      o.ch1 = data;
    }
    else if(data.length === 2){
      o.ch2 = data[1];
    }
  }
  else{
    o.ch1 = data;
  }
  o.ch1 = o.ch1.filter( x => x[2] == 'speech' );
  o.ch2 = o.ch2.filter( x => x[2] == 'speech' );
  return o;
}

function add_timestamps(o) {
  return () => {
    let t;
    let len2;
    for(t = 0, len2 = o.ch1.length; t < len2; t++){
      let x = o.ch1[t];
      let span = {
        offset: x[0],
        length: round_to_6_places(x[1] - x[0])
      };
      let docid = window.ldc.ns.waveform.docid.replace(/:B$/, ':A');
      add_audio_to_list(docid, '.SegmentList', 'new.Segment', span);
    }
    let u;
    let len3;
    for(u = 0, len3 = o.ch2.length; u < len3; u++) {
      let x = o.ch2[u];
      let span = {
        offset: x[0],
        length: round_to_6_places(x[1] - x[0])
      };
      console.log(span);
      let docid = window.ldc.ns.waveform.docid.replace(/:A$/, ':B');
      add_audio_to_list(docid, '.SegmentList', 'new.Segment', span);
    }
    add_audio_to_listq();
  }
}

function add_asr_send(path){
}

function add_asr_sendx2(path){
}

function add_asr_sendx(path){
}

function addasr1(source_uid){
}

function addasr2(source_uid){
}

export {
  get_promises,
  add_sad_send,
  add_asr_send,
  add_asr_sendx,
  add_asr_sendx2,
  check_channels,
  add_timestamps,
  addasr1,
  addasr2
}
