function fmap_helper(mode, delegate, e, map){
  if(e.ctrlKey || e.altKey) map = map.control;
  if(mode){
    map = map[delegate.get_mode()];
  }
  else{
    if(!map) map = {};
  }
  if(map){
    const f = map[e.key];
    if(f){
      return f;
    }
    else{
      console.log('no binding 1');
      console.log(e);
    }
  }
  else{
    console.log(`mode not found: ${delegate.get_mode()}`);
    console.log(e);
  }
}

function fmap2(mode, delegate, e, map){
  if(e.ctrlKey || e.altKey) map = map.control;
  if(mode){
    map = map[delegate.get_mode()];
  }
  else{
    if(!map) map = {};
  }
  if(map){
    const f = map[e.key];
    if(f){
      if(delegate[f]){
        return delegate[f](e);
      }
      else{
        console.log(`no function: ${f}`);
      }
      // return f;
    }
    else{
      console.log('no binding 2');
      console.log(e);
      return 'none';
    }
  }
  else{
    console.log(`mode not found: ${delegate.get_mode()}`);
    console.log(e);
  }
}

export { fmap_helper, fmap2 }
