import { add_message, add_message_listitem, submit_form, add_callback } from './modification2'
import { srcs } from './sources_stores'
import { segments } from './stores'
// import { event } from '../guides/guide'
import { round_to_3_places } from './times';

function done(comment){
  add_message('0', 'done', comment);
  submit_form();
}

function broken(comment){
  add_message('0', 'broken', comment);
  submit_form();
}

function skip(){
  add_message('0', 'skip', null);
  submit_form();
}

function change_value(n, v, f){
  add_message(n, 'change', { value: v });
  submit_form();
  add_callback( () => update_segments() );
  if(f) add_callback(f);
}

function delete_all(){
  $('.ListItem').each(function(i, x) {
    add_message($(x).data().meta.id, 'delete', null);
  });
  if(window.ldc.nodes){
    // add_message('0', 'delete_all', null);
    for(const [k, v] of window.ldc.segmap){
      add_message(k, 'delete', null);
    }
  }
  submit_form();
  add_callback( () => update_segments() );
}

function delete_all2(all){
  $('.ListItem').each(function(i, x) {
    let docid = $(x).find('.Segment').data().value.docid;
    if(all.includes(docid)){
      add_message($(x).data().meta.id, 'delete', null);
      console.log(`delete ${docid}`);
    }
  });
  submit_form();
  add_callback( () => update_segments() );
}

function delete_all_sections(){
  $('.SectionListItem').each(function(i, x) {
    add_message($(x).data().meta.id, 'delete', null);
  });
  submit_form();
  add_callback( () => update_segments() );
}

function delete_last_section(){
  let last = null;
  $('.SectionListItem').each(function(i, x) {
    let id = $(x).data().meta.id;
    if (Number(id) > Number(last)) {
      last = id;
    }
  });
  if(last){
    add_message(last, 'delete', null);
    submit_form();
    add_callback( () => update_segments() );
  }
}

function create_test_segment(waveform){
  const list_selector = '.SegmentList';
  const audio_path = 'new.Segment';
  const span = {
    offset: 1.0,
    length: 1.0
  };
  add_audio_to_list(list_selector, audio_path, span);
  submit_form();
  add_callback( () => update_segments() );
}

function split_segment_at_cursor(w) {
  const cursortime = w.component.cursor_time();
  console.log(w.map);
  if(window.ldc.crnt){
    // id = $('.active-transcript-line').attr 'id'
    let data;
    let seg;
    if(window.ldc.obj2.xlass_def_id == 2){
      let crnt = parseInt(window.ldc.crnt);
      seg = window.ldc.segmap.get(crnt);
      data = {
          meta: {
              id: crnt + 1
          },
          value: {
              beg: seg.beg,
              end: seg.end
          }
      };
      const src = data.value;
      const e = seg.endi;
      if(cursortime > src.beg && cursortime < src.end){
        const span = { offset: round_to_3_places(cursortime + w.split_line_margin) };
        span.length = round_to_3_places(src.end - span.offset);
        src.end = round_to_3_places(cursortime - w.split_line_margin);
        const b = window.ldc.obj.last_iid + 1;
        add_nodes1(2);
        const src2 = { beg: seg.begi, end: b };
        add_message(data.meta.id, 'change', src2);
        add_message('SegmentList', 'add', null);
        add_message('new.Arc', 'change', { beg: (b+2), end: e });
        add_nodes2(seg.docid, [ [ b, src.end ], [ b+2, span.offset ] ]);
        seg.nodes.get('Arc').node_value.set(src2);
        submit_form();
        add_callback( () => update_segments() );
      }
    }
    else{
      data = window.$(`#node-${window.ldc.crnt} .Audio`).data();
      const src = data.value;
      if(cursortime > src.beg && cursortime < src.end){
          const span = { offset: cursortime + w.split_line_margin };
          span.length = round_to_3_places(src.end - span.offset);
          src.end = round_to_3_places(cursortime - w.split_line_margin);
          if(window.ldc.nodes) seg.nodes.get('Segment').node_value.set(src);
          add_message(data.meta.id, 'change', src);
          const f = () => {
            event.dispatch(null, 'split_segment');
            return add_audio_to_list(w.wave_docid, null, null, span);
          };
          add_transcript_line_split(span, f);
      }
    }
  }
}

function merge_with_following_segment(waveform){
    const w = waveform;
    console.log(w.map);
    const ids = window.ldc.main.find_active_id();
    if(ids.id && ids.next){
      const id = ids.id;
      const next_id = ids.next;
      if(window.ldc.nodes){
        const crnt = parseInt(w.map.get(id).split('-')[1]);
        let seg = window.ldc.segmap.get(crnt);
        const seg1 = seg;
        const data = {
          meta: {
            id: crnt + 1
          },
          value: {
            beg: seg.begi,
            end: seg.endi
          }
        };
        const crnt2 = parseInt(w.map.get(next_id).split('-')[1]);
        seg = window.ldc.segmap.get(crnt2);
        const next_data = {
          meta: {
            id: crnt2 + 1
          },
          value: {
            beg: seg.begi,
            end: seg.endi
          }
        };
        // w.delete_transcript_line_based_on_segment_id(next_id, false);
        const src = data.value;
        src.end = next_data.value.end;
        if(window.ldc.obj2.xlass_def_id == 2){
          seg1.nodes.get('Arc').node_value.set(src);
        }
        else{
          next_data.value.beg = seg.docid;
          next_data.value.beg = seg.beg;
          next_data.value.beg = seg.end;
          seg1.nodes.get('Segment').node_value.set(src);
        }
        add_message(data.meta.id, 'change', src);
        const v1 = window.ldc.segmap.get(crnt).text;
        const v2 = window.ldc.segmap.get(crnt2).text;
        if(v2 && v2.length > 0){
          let v = { value: `${v1} ${v2}` };
          if(window.ldc.obj2.xlass_def_id == 2){
            seg1.nodes.get('Text').node_value.set(v);
          }
          else{
            seg1.nodes.get('Transcription').node_value.set(v);
          }
          add_message(crnt+2, 'change', v);
        }
        delete_transcript_line_based_on_segment_id(w, next_id, false);
        segments.update( (x) => x );
      }
      else{
        let data = $(`#${w.map.get(id)} .Audio`).data();
        let next_data = $(`#${w.map.get(next_id)} .Audio`).data();
        delete_transcript_line_based_on_segment_id(w, next_id, false);
        const src = data.value;
        src.end = next_data.value.end;
        add_message(data.meta.id, 'change', src);
        data = $(`#${w.map.get(id)} .Transcription`).data();
        next_data = $(`#${w.map.get(next_id)} .Transcription`).data();
        const v1 = data.value.value;
        const v2 = next_data.value.value;
        if(v2 && v2.length > 0){
          add_message(data.meta.id, 'change', {
            value: `${v1} ${v2}`
          });
        }
        $(`#node-${data.meta.id}`).addClass('refresh');
      }
      submit_form();
      add_callback( () => update_segments() );
      event.dispatch(null, 'merged_segments');
    }
  }

function delete_transcript_line_based_on_listitem_id(id, submit) {
  let idd = `${parseInt(id) + 1}`;
  srcs.update( (srcs) => {
    for(const k in srcs){
      if(srcs[k][idd]) delete srcs[k][idd];
    }
    return srcs;
  } );
  add_message(id, 'delete', null);
  if(submit){
    submit_form();
    add_callback( () => update_segments() );
  }
}

function delete_transcript_line_based_on_segment_id(w, x, submit) {
  const sel = `#${w.map.get(x)}`;
  if(window.ldc.nodes){
    return delete_transcript_line_based_on_listitem_id(sel.split('-')[1], submit);
  }
  return delete_transcript_line_based_on_listitem_id($(sel).data().meta.id, submit);
}

function add_segment(segment, callback){
  let b = window.ldc.obj.last_iid + 1;
  let vals = [];
  if(window.ldc.obj2.xlass_def_id == 2){
  vals.push([ 'N', { docid: segment.docid, beg: segment.beg, type: 'real' } ]);
  add_message_listitem('NList', vals);
  vals = [];
  vals.push([ 'N', { docid: segment.docid, beg: segment.end, type: 'real' } ]);
  add_message_listitem('NList', vals);
  vals = [];
  vals.push([ 'Arc', { beg: b, end: (b+2) } ]);
  }
  else{
    vals.push([ 'Segment', { docid: segment.docid, beg: segment.beg, end: segment.end, type: 'real' } ]);
  }
  if(segment.text) vals.push([ 'Text', { value: segment.text } ]);
  if(segment.speaker) vals.push([ 'Speaker', { value: segment.speaker } ]);
  // console.log(segment);
  add_message_listitem('SegmentList', vals);
  add_callback(callback);
}

function save_unintelligible(e, x){
  const input = e.detail.e.target;
  const a = input.selectionStart;
  const b = input.selectionEnd;
  console.log(x);
  const s = window.getSelection();
  console.log(s);
  const iid = x.iid + 2;
  const edit = x.text.substring(0, a) + '((' + x.text.substring(a, b) + '))' + x.text.substring(b);
  if(window.ldc.nodes){
      console.log('here')
      console.log(window.ldc.segmap.get(x.iid));
      const text = window.ldc.obj2.xlass_def_id == 2 ? 'Text' : 'Transcription';
      window.ldc.segmap.get(x.iid).nodes.get(text).node_value.set( { value: edit } );
      waveform.component.set_active_transcript_line(null);
      segs = segs;
  }
  add_message(iid, 'change', { value: edit });
  submit_form();
  add_callback( () => { update_segments(); } );
}

function redactf(iid, redact_text, redact_iid, redact_edit){
  if(window.ldc.nodes){
      const text = window.ldc.obj2.xlass_def_id == 2 ? 'Text' : 'Transcription';
      window.ldc.segmap.get(iid-2).nodes.get(text).node_value.set( { value: redact_text } );
      if(redact_edit) window.ldc.segmap.get(parseInt(redact_iid)-2).nodes.get(text).node_value.set( { value: redact_edit } );
  }
  add_message(iid.toString(), 'change', { value: redact_text });
  if(redact_edit) add_message(redact_iid, 'change', { value: redact_edit });
  submit_form();
  add_callback( () => { update_segments(); } );
}

function set_speaker_value(id, value, rf, nodes) {
  window.ldc.vars.penultimate_speaker_used = window.ldc.vars.last_speaker_used;
  window.ldc.vars.last_speaker_used = value;
  if(rf) rf();
  if(window.ldc.nodes) nodes.get('Speaker').node_value.set( { value: value } );
  window.ldc.speakers.set(value, value);
  add_message(id, 'change', { value: value });
  submit_form();
  add_callback( () => update_segments() );
  return value;
}

function set_speaker_value_replace(x, value){
  window.ldc.vars.penultimate_speaker_used = window.ldc.vars.last_speaker_used;
  window.ldc.vars.last_speaker_used = value;

  if(window.ldc.nodes){
    for(const [k, v] of window.ldc.segmap){
      if(v.speaker == x){
        let s = v.nodes.get('Speaker');
        s.node_value.set( { value: value } );
        add_message(s.iid, 'change', { value: value });
      }
    }
  }
  else{
    $('.Speaker').each(function(i, z) {
      if($(z).data().value.value == x) add_message($(z).data().meta.id, 'change', { value: value });
    });
  }
  submit_form();
  add_callback( () => update_segments() );
  return value;
}

function delete_segments(ids){
  for(let id of ids) add_message(id, 'delete', null);
  submit_form();
  add_callback( () => update_segments() );
}

function add_section(section, id){
  let vals;
  if(window.ldc.obj2.xlass_def_id == 2){
    const seg = window.ldc.segmap.get(id);
    vals = [
      [ 'Arc', { beg: seg.begi, end: seg.endi } ],
      [ 'Name', { value: section } ]
    ];
  }
  else{
    vals = [
      [ 'Section', { value: section } ],
      [ 'BegSeg', { value: id.toString() } ]
    ];
  }
  add_message_listitem('SectionList', vals);
  // ldc_annotate.add_message(window.gdata('.SectionList').meta.id, 'add', null);
  // ldc_annotate.add_message('new.Section', 'change', { value: section });
  // ldc_annotate.add_message('new.BegSeg', 'change', { value: id });
  // ldc_annotate.submit_form();
  add_callback( () => update_segments() );
  window.ldc.sections.set(section, section);
}

function section_order_forced_open(h){
  let obj;
  if(window.ldc.obj2.xlass_def_id == 2){
    obj = {}
    obj.length = window.ldc.secmap.size;
    obj.a = -1;
    for(const [k, v] of window.ldc.secmap){
      if(v.end > obj.a) obj.a = v.end;
    }
    obj.b = window.ldc.segmap[h.iid].beg;
  }
  else{
    obj = last_section_obj(h.iid, null);
  }
  const length = obj.length;
  const a = obj.a;
  const b = obj.b;
  if(a > b){
    alert(`new section must follow last section, but ${a} > ${b}`);
    return;
  }
  const sections = window.get_constraint('sections');
  if(!sections){
      alert("sections aren't available");
      return;
  }
  if(length > sections.length){
    alert('no more sections');
    return;
  }
  add_section(sections[length], h.iid);
}

function open_sectionf(id, section){
  let obj;
  if(window.ldc.obj2.xlass_def_id == 2){
    // obj = get_last_section(id);
    // if(!h.sec) return;
    obj = {}
    for(const [k, v] of window.ldc.secmap){
      if(v.section == section) obj.exists = true
    }
  }
  else{
    obj = last_section_obj(id, section);
    if(!obj) return;
  }
  if(obj.exists){
    alert(`section ${section} already exists`);
  }
  else if(obj.repeat){
    alert("sections can't overlap");
  }
  else{
    add_section(section, id);
  }
};

function close_section(h) {
  if(window.ldc.obj2.xlass_def_id == 2){
    extend_section(h);
    return;
  }
  if(window.get_constraint('section_order_forced') === true){
    section_order_forced_close(h);
  }
  else{
    close_section2(h);
  }
}
function section_order_forced_close(hh){
  const h = get_open_section(hh.iid);
  if(h && h.id) set_pointer(h.eseg.meta.id, h.id);
}

function extend_section(hh) {
  const h = get_last_section(hh.iid);
  console.log(h);
  if(!h.sec) return;
  const src = { beg: h.sec.begi, end: h.seg.endi };
  add_message(h.sec.iid+1, 'change', src);
  submit_form();
  add_callback( () => update_segments() );
}

function close_section2(hh) {
  const h = get_open_section(hh.iid);
  if(h){
    if(h.same){
      if(h.id){
        set_pointer(h.eseg.meta.id, h.id);
      }
    }
    else{
      h.overlap = false;
      h.src = {
        beg: h.a.value.beg,
        end: h.b.value.end
      };
      const last_section = find_last_section(h);
      if(h.overlap) alert("sections can't overlap");
      else if(h.id) set_pointer(h.eseg.meta.id, h.id);
    }
  }
}

function set_pointer(pointer, segment) {
  console.log('setting pointer ' + pointer)
  add_message(pointer, 'change', { value: segment.toString() });
  submit_form();
  add_callback( () => update_segments() );
}

function delete_nodes_after(after){
  let anyDeletion = false;
  document.querySelectorAll(".Node").forEach(n=>{
    const data = $(n).data("meta");
    if (data === undefined) return;
    const id = Number(data.id);
    if (isNaN(id) || id < 4 || id <= after) return;
    add_message(id, 'delete', null);
    anyDeletion = true;
  });
  if (anyDeletion){
    submit_form();
    add_callback( update_segments );
  }
}

function add_nodes1(n){
  for(let i = 0; i < n; i++){
    add_message('NList', 'add', null);
  }
}

function add_nodes2(docid, times){
  for(const x of times){
    add_message(x[0]+1, 'change', { docid: docid, beg: x[1], type: 'real' });
  }
}

function add_audio_to_list(docid, list_selector, audio_path, span){
  console.log(span);
  if (span.length === 0) {
    // this doesn't always make sense
    return alert('select a region first');
  } else {
    const etime = span.end || (span.offset + span.length);
    const src = {
      docid: docid,
      beg: round_to_3_places(span.offset),
      end: round_to_3_places(etime),
      type: 'real'
    };
    let b;
    if(window.ldc.obj2.xlass_def_id == 2){
      b = window.ldc.obj.last_iid + 1;
      add_nodes1(2);
    }
    if(false){// (this.debug) {
      console.log('list');
      // console.log(list_selector);
    }
    add_message($('.SegmentList').data().meta.id, 'add', null);
    // w = if w.active_channel is 0 then waveform else waveform2
    // src.play_head = src.beg;
    if (true) { //@debug
      console.log('adding line');
      console.log(src);
    }
    if(window.ldc.obj2.xlass_def_id == 2){
      add_message('new.Arc', 'change', { beg: b, end: (b+2) });
      add_nodes2(docid, [ [ b, src.beg ], [ b+2, src.end ] ]);
    }
    else{
      add_message('new.Segment', 'change', src);
    }
    if (span.transcript) {
      const name = window.ldc.obj2.xlass_def_id == 2 ? 'new.Text' : 'new.Transcription';
      add_message(name, 'change', { value: span.transcript });
    }
    if (span.speaker) {
      add_message('new.Speaker', 'change', { value: span.speaker });
    } else {
      const speaker = window.ldc.vars.last_speaker_used;
      if(speaker) add_message('new.Speaker', 'change', { value: speaker });
    }
    return 'submit';
  }
}

function add_audio_to_listq(){
  submit_form();
  add_callback( () => update_segments() );
}

function add_audio_to_listp(docid, span, f){
  const r = add_audio_to_list(docid, null, null, span);
  if(r === 'submit'){
    add_audio_to_listq();
    if(f) add_callback(f);
  }
}
function add_timestamps2(data, ch){
  const round_to_3_places = (num) => Math.round(num * 1000) / 1000;
  console.log('check')
  console.log(round_to_3_places)
  var j, len, span, x;
  const docid = ch == 'B' ? window.ldc.ns.waveform.docid2 : window.ldc.ns.waveform.docid;
  for (j = 0, len = data.length; j < len; j++) {
    x = data[j];
    span = {
      offset: x.beg,
      length: round_to_3_places(x.end - x.beg),
      transcript: x.text,
      speaker: x.speaker
    };
    // console.log(span);
    // console.log('wave')
    // console.log(ns.waveform)
    add_audio_to_list(docid, null, null, span);
  }
  add_audio_to_listq();
}

function delete_section(id){
  if (id) {
    if (id === 'all') {
      $('.SectionListItem').each(function(i, x) {
        const iid = $(x).data().meta.id;
        add_message(iid, 'delete', null);
      });
    } else {
      add_message(id, 'delete', null);
    }
    submit_form();
    add_callback( () => update_segments() );
  }
};

function set_text(iid, value, transcription, f){
  const text = window.ldc.obj2.xlass_def_id == 2 ? 'Text' : 'Transcription';
  if(window.ldc.nodes) transcription.nodes.get(text).node_value.set( { value: value } );
  add_message(iid, 'change', { value: value });
  submit_form();
  add_callback(f);
}

function add_empty_segments(emptySegments){
  emptySegments.forEach( s => 
    add_message(s.value.id, 'change', {value: s.value.words.join(" ")})
  );
  if (emptySegments.length){
    submit_form();
    add_callback( () => window.ldc.main.refresh() );
  }
}

function update_node(docid, n, r, begend){
  const seg = window.ldc.segmap.get(parseInt(n.split('-')[1])).nodes.get('Arc');
  const v = { docid: docid, beg: r, type: 'real' };
  add_message(seg.value[begend]+1, 'change', v);
  submit_form();
}

function update_wave(wave_docid, n, span_offset, span_end){
  if(window.ldc.nodes){
    let seg = window.ldc.segmap.get(parseInt(n.split('-')[1])).nodes.get('Segment');
    n = seg.iid;
    let src = {
        docid: wave_docid,
        beg: span_offset,
        end: span_end,
        type: 'real'
    };
    add_message(n, 'change', src);
  }
  else{
    n = $(`#${n}`).data().Segment.meta.id;
    // ww = if w.active_channel is 0 then w else waveform2
    add_message(n, 'change', {
        docid: wave_docid,
        beg: span_offset,
        end: span_end,
        play_head: span_offset,
        timestamps: true
    });
  }
  submit_form();
  add_callback( () => update_segments() );
}

// function split_segment(data, seg, src, span, f){
//   if(window.ldc.nodes) seg.nodes.get('Segment').node_value.set(src);
//   add_message(data.meta.id, 'change', src);
//   add_transcript_line_split(span, f);
// }

function add_transcript_line_split(span, f){ //add_transcript_line(aa, bb, 'split');
  const r = f(span);
  if(r === 'submit'){
    submit_form();
    add_callback( () => update_segments() );
  }
}

function check_for_submit(f, cb){
  let r = f();
  if(r === 'submit'){
    submit_form();
    add_callback( () => update_segments() );
    if(cb) add_callback(cb);
  }
}

function save_redaction(iid, redact_text, redact_iid, redact_edit){
  add_message(iid.toString(), 'change', { value: redact_text });
  if(redact_edit) add_message(redact_iid, 'change', { value: redact_edit });
  submit_form();
  add_callback( () => { update_segments(); } );
}

function add_cb(f){ add_callback(f); }

function add_save_asr(json, ch, cb){
  setTimeout( () => {
      add_timestamps2(json, ch)
      // console.log(json)
      // add_cb( () => {
          // window.location.reload();
          add_cb(cb);
      // });
  }, 100 );
}

export {
  done,
  broken,
  skip,
  change_value,
  delete_all,
  delete_all2,
  delete_all_sections,
  delete_last_section,
  create_test_segment,
  merge_with_following_segment,
  delete_transcript_line_based_on_segment_id,
  add_segment,
  save_unintelligible,
  redactf,
  set_speaker_value,
  set_speaker_value_replace,
  delete_segments,
  open_sectionf,
  section_order_forced_open,
  close_section,
  delete_nodes_after,
  add_audio_to_list,
  add_audio_to_listp,
  add_audio_to_listq,
  add_timestamps2,
  delete_section,
  set_text,
  add_empty_segments,
  update_wave,
  update_node,
  // split_segment,
  check_for_submit,
  split_segment_at_cursor,
  save_redaction,
  add_cb,
  add_save_asr
}