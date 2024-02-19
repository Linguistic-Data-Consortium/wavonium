<script>
    import { tick, createEventDispatcher, onMount, onDestroy } from 'svelte';
    const dispatch = createEventDispatcher();
    import { btn, cbtn, dbtn, btn1 } from './buttons'
    import { event } from './guide';
    import { create_action } from './controllers';
    import { settings, active_docid, active_channel, sections, segments, undefined_segments } from './stores';
    import { times, selection, round_to_3_places, round_to_6_places } from './times';
    import { srcs, sources_object_add_node, add_source_audio_collision } from './sources_stores';
    import {
        play_src_with_audio_id,
        stop_playing,
        play_callback,
        callf,
        is_playing,
        set_playback_rate,
        set_audio_element,
        set_audio_element_with_array,
        set_audio_id_to_channel,
        decode_audio_data
    } from 'ldcjs/src/audio/main';
    import { add_sad_send, add_asr_send, add_timestamps, addasr1, addasr2 } from './services';
    import {
        done,
        skip,
        broken,
        add_audio_to_list,
        add_audio_to_listp,
        update_wave,
        update_node,
        split_segment_at_cursor,
        merge_with_following_segment,
        add_cb,
        add_save_asr,
        add_timestamps2,
        delete_all,
        delete_all2,
        delete_section,
        delete_segments,
        check_for_submit,
        change_value
    } from './modification1';
    import { fmap_helper } from './keyboard_helper'
    import { x as keymap } from './keys_waveform'
    import { x as inputmap } from './keys_input'
    import { set_urls } from './aws_helper';
    import { getp, getp_wav, postp } from 'https://cdn.jsdelivr.net/gh/Linguistic-Data-Consortium/ldcjs@0.0.9/src/getp.js'
    import { ParseB } from './parse_b';
    import Spinner from './spinner.svelte';
    import parse_sad_with_aws from './parse_sad_with_aws';
    import parse_tsv from './parse_tsv2';
    import parse_tdf from './parse_tdf';
    import { create_download_url } from 'https://cdn.jsdelivr.net/gh/Linguistic-Data-Consortium/ldcjs@0.0.6/src/download_helper.js'
    import { create_transcript } from './download_transcript_helper'
    import Table from './table.svelte'
    import { Keyboard } from './keyboard';
    keymap.beg = keymap.selection;
    keymap.end = keymap.selection;
    let debug = false;
    let experimental;
    export let ns;
    export let source_uid;
    // $: redactiondocid = redaction_docid(source_uid);
    export let data_set_id;
    let data_set_file_name;
    export let redact;
    export let callbacks;
    export let permissions;
    export let constraint_export_transcript;
    export let constraint_export_transcript_to_task_admin;
    export let constraint_import_transcript_auto;
    export let constraint_rtl;
    export let constraint_speakers;
    export let constraint_sections;
    export let constraint_section_order_forced;
    export let xlass_def_id;
    export let kit_id;

    let docid = source_uid;
    const docids = [ docid ];
    let wave_docid = docid;
    let header;
    let header_size;
    let duration;
    let sample_rate;
    let block_size;
    let play_head = 0;
    let split_line_margin = 0.1;

    // The variables two and stereo don't mean exactly the same thing.
    // The more general meaning of two channels is two == true, but
    // it's possible for two channels to be in two separate files,
    // which would be stereo == false.  The typical case of a single stereo
    // file would be two == true and stereo == true.
    // Most of the time, knowing whether there's one or two channels is sufficient,
    // but sometimes you need to know whether there's a real stereo file present.

    let stereo;
    // the _A _B case may not be working; probably not needed
    let two = source_uid.match(/_A\.wav/) ? true : false;
    if(two) docids[1] = source_uid.replace(/_A/g, '_B');



    let i = 0;
    let id = `node-00-waveform-${i}`;
    let id2 = `node-00-waveform-${i+1}`;
    let div;
    let ticks = [];
    let draw_underlines_flag = true;
    let underline_height = 5;
    let underlines0a = [];
    let underlines1a = [];
    let underlines0height = 0;
    let underlines1height = 0;
    let cursor_class = "cursor-auto";

    // movement mode
    // move cursor, window, beg (of selction), or end (of selection)
    let mode = 'cursor';

    let active_channeln = 0; // 0 or 1
    let active_top = 0; // the top of divs that can be on either channel, like the cursor

    // define the viewable portion of the waveform
    let wave_display_offset;
    let wave_display_length;
    // define the selected portion of the waveform
    let wave_selection_offset;
    let wave_selection_length;
    let wave_selection_end;
    let wave_selection_src;

    let wave_scale;
    let wave_buffer_sample_rate;
    let step1;
    let step2;
    let step3;
    let step4;

    function convert_seconds_to_pixels(seconds){ return seconds / wave_scale; }
    function convert_pixels_to_seconds(pixels){ return pixels * wave_scale; }
    function convert_seconds_to_pixels_by_offset(seconds){
        const diff = seconds - wave_display_offset;
        if(diff <= 0) return 0;
        if(diff > wave_display_length) return convert_seconds_to_pixels(wave_display_length);
        else                           return convert_seconds_to_pixels(diff);
    }

    // all the divs have to match this width for calculations to make sense
    let width;
    let time_height = 0;
    let scrollbar_x;
    let scrollbar_width;
    let srcso;
    let canvas0;
    let ctx0;
    let canvas1;
    let ctx1;
    let wave_canvas_height = 125;
    // the x position of these events, in real time
    let mousedown_x;
    let mouseup_x;
    let mousemove_x;

    let mousedown_b;
    let cursor_x;
    $: cursor_x = mousemove_x === 0 ? 0 : (mousemove_x || mousedown_x);
    $: cursortime = convert_pixels_to_seconds(cursor_x) + wave_display_offset;
    $: text = round_to_3_places(cursortime).toString();

    let samples_per_pixel;
    const samples_per_pixel_threshold = 200; // for deciding whether to draw an envelope or a graph

    let line = false;
    let max_only = true;
    let sample_skip = 1;
    let disable_waveform = false;

    let lastk;

    let spectrogram;
    let spectrogram_open;

    let wave_adjust_btime = false;
    let wave_adjust_etime = false;
    let wave_adjust_time = false;
    let wave_adjust_scroll = false; // update waveform based on scrolling on mouse move
    let wave_autoscroll = false;

    let selection_rect;
    let selection_beg_x = 0;
    let selection_end_x = 0;
    $: selection_beg_text = round_to_3_places(convert_pixels_to_seconds(selection_end_x)+wave_display_offset).toString();
    $: selection_end_text = round_to_3_places(convert_pixels_to_seconds(selection_beg_x)+wave_display_offset).toString();

    let redacted_selection_x = 0;
    let redacted_selection_width = 0;
    let redacted_selection_height = wave_canvas_height;
    let redacted_selection_beg_text = '';
    let redacted_selection_end_text = '';
    let all_redactions = [];
    let visible_redactions = [];

    let playheadx;
    let playheadtext = '123.456';

    let muted = false;
    let playback_rate = 1.0;
    const playback_rates = [ 1.0, 1.5, 2.0 ];

    $: set_playback_rate(playback_rate);

    export function set_times_then_draw(x, y){
        set_times(x, y);
    }
    function set_times(x, y){
        // if(!wave_buffer_sample_rate) delay(w,x,y);
        
        if(x < 0) x = 0;
        if(y > duration) y = duration;
        if(x + y > duration) x = duration - y;
        times.update( (t) => {
            t.wave_display_offset = x;
            t.wave_display_length = y;
            wave_scale = y / width;
            sample_calculations(x, y);
            return t;
        } );
        if(debug) console.log(`update set wave display offset ${x} length ${y} and ${samples_per_pixel}`);
        // w.update_cursor = true;
        // w.update_scrollbar = true;
        // w.update_underlines = true;
        // w.update_play_head = true;
        // w.update_tick_times = true;
        // w.update_waveform = true;
        // this.draw_wave_display()
    }
    onMount( () => {
        width = div.offsetWidth;
        // times.update( (x) => {
        //     return {
        //         wave_display_offset: x.wave_display_offset,
        //         wave_display_length: x.wave_display_length
        //     }
        // } );
        keyboard.focus();
    } );
    function canvas0_mount(canvas){
        canvas.width = 1000;
        canvas.height = wave_canvas_height;
        ctx0 = canvas.getContext("2d");
    }
    function canvas1_mount(canvas){
        canvas.width = 1000;
        canvas.height = wave_canvas_height;
        ctx1 = canvas.getContext("2d");
        // if(two) draw_waveformi(x, 1);
    }

    function activate(active_channel){
        if(active_channeln != active_channel){
            active_channeln = active_channel;
            active_top = active_channel == 0 ? 0 : wave_canvas_height + underlines0height;
            wave_docid = docids[active_channel];
            set_audio_id_to_channel(source_uid, active_channel);
        }
    }

    function activate_docid(x){
        if(x && x != wave_docid){
            // active_docid.update( () => docid );
            active_channel.update( () => x == docid ? 0 : 1 );
              // activate3();
        }
    }

    function set_playing_transcript_line() {
        if (document.querySelectorAll('.ChannelA.active_channel').length !== 1) {
            return;
        }
        const found = find_segment();
        if (found) {
            // if (w.last_played_segment && w.last_played_segment !== found) {
            //     w.last_played_segment = found;
            // } else {
                document.querySelector('.playing-transcript-line').classList.remove('playing-transcript-line');
                document.querySelector(`#${found}`).classList.add('playing-transcript-line');
            // }
        } else {
            document.querySelector('.playing-transcript-line').classList.remove('playing-transcript-line');
        }
    }


    const playheads = new Map();
    function waveform_play_callback(node, playing){
        if(!node) return;
        play_head = node.play_head;
        for( const [ k, v ] of playheads) v();
        if(playing){
            if(play_head < wave_display_offset || play_head > wave_display_offset + wave_display_length) {
                set_times_then_draw(play_head, wave_display_length);
            }
            // selector = "#node-#{node.meta.id}-waveform-#{w.active_channel}"
            // selector += ' .waveform-svg'
            // console.log "NAN #{play_head} #{wave_display_offset}" if @debug
            if(set_playing_transcript_line_index){
                set_playing_transcript_line();
            }
            muted = node.muted;
        }
    }

    window.ldc.waveform_play_callback = waveform_play_callback;
    callbacks.set('play_callback', play_callback);
    callbacks.set('waveform_callback', () => callf(waveform_play_callback));

    let create_transcript_auto = false;
    let create_transcript_files;
    let create_transcript_text;
    let create_transcript_json;
    let create_transcript_tsv = false;
    let create_transcript_tdf = false;
    let create_transcript_sad_with_aws = false;
    let create_transcript_jsonn;
    let autoloading = false;
    function create_transcript_retrieve(){
        console.log(data_set_id);
        console.log(data_set_file_name);
        if(data_set_id && data_set_file_name){
            // data_set_id = 3;
            let data_set_p = getp(`/data_sets/${data_set_id}?file_name=${data_set_file_name}`);
            data_set_p.then( (x) => {
                console.log(x);
                create_transcript_text = x.file;
                create_transcript_json = parse_tdf(create_transcript_text);
                create_transcript_add();
            } );
        }
    }
    function create_transcript_upload(){
        const r = new FileReader();
        let o = null;
        r.onload = function(e){
            create_transcript_text = e.target.result;
            if(create_transcript_text.match(/^file;unicode/)){
                create_transcript_tdf = create_transcript_text;
            }
            else if(create_transcript_text.match(/^\s*\[\s*\{/)){
                create_transcript_tdf = create_transcript_text;
            }
            else if(create_transcript_text.match(/^\s*\[\s*\{/)){
                create_transcript_jsonn = create_transcript_text;
            }
        }
        r.readAsText(create_transcript_files[0]);
    }
    function create_transcript_add(){
        create_transcript_auto = false;
        setTimeout( () => update_segments2(create_transcript_json), 100 );
    }
    function create_transcript_add_save(){
        create_transcript_auto = false;
        setTimeout( () => {
            add_timestamps2(json);
            add_cb( () => {
                window.location.reload();
            });
        }, 100 );
    }
    export function upload_transcript(){
        show('upload_transcript');
    }
    let download_transcript_text;
    let download_transcript_json;
    let download_transcript_include_headers = false;
    let download_transcript_filename;
    let download_transcript_link;
    let download_transcript_url;
    let download_transcript_include_speaker = false;
    let download_transcript_include_section = false;
    function download_transcript_create(){
        let kit = kit_id;
        download_transcript_text = create_transcript(kit, download_transcript_include_speaker, download_transcript_include_section, download_transcript_include_headers, segs);
        download_transcript_url = create_download_url(download_transcript_text);
        tick().then( () => download_transcript_link.href = download_transcript_url );
    }
    function asr(){
        activate_sr()
    }
    let show_asr = false;
    const permission_to_download = constraint_export_transcript || permissions.project_manager ||
        (constraint_export_transcript_to_task_admin && permissions.task_admin);
    let add_sad_p;
    let add_sad_p2;
    let add_sad_p2_message;
    let add_sad_p3;
    function show(x){
        if(x == 'main') dialog_main.showModal();
        if(x == 'show_help_screen_waveform') dialog_waveform.showModal();
        if(x == 'show_help_screen_input') dialog_input.showModal();
        if(x == 'show_help_screen_playback') dialog_playback.showModal();
        if(x == 'show_help_screen_services') dialog_services.showModal();
        if(x == 'add_sad'){
            dialog_sad.showModal();
            active_docid.subscribe( (x) => add_sad_p = add_sad_send(x) );
            add_sad_p3 = add_sad_p.then( (data) => {
                console.log('adding')
                console.log(data);
                const f = add_timestamps(data);
                f();
                add_cb( () => dialog_sad.close() );
                return 'displaying segments...';
            } );
        }
        if(x == 'add_asr'){
            dialog_asr.showModal();
            const cb = () => dialog_asr.showModal();
            add_sad_p2_message = 'running sad...';
            if(addasr1(source_uid)){
                add_sad_p2_message = 'retrieving transcript...';
                add_sad_p2 = addasr2(source_uid)
                .then(getp)
                .then( (x) => {
                    const t = { ch1: parse_tsv(x) };
                    return t;
                } );
                add_sad_p3 = add_sad_p2.then( (data) => {
                    if(data == null) return "error using file";
                    console.log('adding')
                    console.log(data)
                    let y;
                    if(data.ch1 && data.ch1.length > 0){
                        y = data.ch1;
                        add_save_asr(y, 'A', cb);
                    }
                    if(data.ch2 && data.ch2.length > 0){
                        y = data.ch2;
                        add_save_asr(y, 'B', cb);
                    }
                    return 'displaying segments...';
                } );
            }
            else{
                add_sad_p2 = add_asr_send(source_uid);
                // p2 = Promise.resolve( { ch1: [] });
                add_sad_p3 = add_sad_p2.then( (data) => {
                    if(data == null) return "error using file";
                    console.log('adding')
                    console.log(data)
                    let y;
                    if(data.ch1 && data.ch1.length > 0){
                        y = parse_sad_with_aws(data.ch1);
                        add_save_asr(y, 'A', cb);
                    }
                    if(data.ch2 && data.ch2.length > 0){
                        y = parse_sad_with_aws(data.ch2);
                        add_save_asr(y, 'B', cb);
                    }
                    // const f = add_timestamps(data);
                    // f();
                    // add_cb( () => dispatch('show', null) );
                    return 'displaying segments...';
                } );
            }
        }
        if(x == 'upload_transcript'){
            dialog_upload_transcript.showModal()
            // if(constraint_import_transcript_auto) data_set_file_name = docid;
            if(data_set_file_name) create_transcript_retrieve();
            if(create_transcript_auto) create_transcript_text = create_transcript_auto;
            if(ns.task_id == 77 || ns.task_id == 79){
                autoloading = true;
                create_transcript_autox = false;
                create_transcript_json = parse_sad_with_aws(create_transcript_text);
                create_transcript_add_save();
            }
        }
        if(x == 'download_transcript') dialog_download_transcript.showModal();
        if(x == 'close_kit') dialog_close_kit.showModal();
        if(x == 'delete_all') dialog_delete_all.showModal();
    }
    function userf(f, e){
        const o = { userf: f, e: e };
        // const h = { help_screen: help_screen, input_screen: input_screen };
        if(f == 'delete_all_confirm'){
            show('delete_all');
        }
        else if(f == 'settings'){
            settings.update( (x) => { 
                x.open = true;
                return x;
            } );
        }
        else if(f == 'spectrogram'){
            dialog_spectrogram.showModal();
            // ch1.spectrogramf();
            // ch2.spectrogramf();
            // spectrogram_settings.update( (x) => {
            //     x.spectrogram_open = !x.spectrogram_open;
            //     return x;
            // });
        }
        // else if(f == 'header'){
        //   header = true;
        //   tick().then( () => header_input.focus() );
        // }
        else if(f == 'command'){
            command(f);
        }
        else if(f == 'show_help_screen_main'){
            show('main');
        }
        else if(f == 'focus_input'){
            refocus();
        }
        else if(f == 'play_current_span_or_play_stop'){
            play_current_span_or_play_stop();
        }
        // else if(f == 'add_transcript_line_based_on_play_head'){
        //     add_transcript_line_based_on_play_head();
        // }
        // else if(f == 'open_spectrogram'){
        //     
        //     // w.spectrogram_flag = !w.spectrogram_flag;
        //     // if (w.spectrogram_flag) {
        //     //     $('.spectrogram-canvas').show();
        //     //     w.draw_spectrogram();
        //     // } else {
        //     //     $('.spectrogram-canvas').hide();
        //     // }
        // }
        // // keep center point the same, but toggle between step size of .5s and .2s
        else if(f == 'toggle_zoom'){
            toggle_zoom();
        }
        else if(f == 'zoom_in'){
            zoom_in();
        }
        else if(f == 'zoom_out'){
            zoom_out();
        }
        // else if(f == 'play_head_menu'){
        //     console.log('in the segments component');
        // }
        // // else if(f == 'refresh_waveform'){
        // //     $('.Waveform').each(function(i, x) {
        // //         $(x).data().waveform.update_waveform = true;
        // //     });
        // // }
        // else if(f == 'not_sure'){
        //     console.log('not sure');
        // }
        else if(f == 'play_current_span'){
            play_current_span();
        }
        else if(f == 'set_mode_to_window'){
            set_mode('window');
        }
        else if(f == 'set_mode_to_beg'){
            set_mode('beg');
        }
        else if(f == 'set_mode_to_end'){
            set_mode('end');
        }
        else if(f == 'move_cursor_lstep1'){
            move_cursor_lstep1();
        }
        else if(f == 'move_cursor_lstep2'){
            move_cursor_lstep2();
        }
        else if(f == 'move_cursor_lstep3'){
            move_cursor_lstep3();
        }
        else if(f == 'move_cursor_lstep4'){
            move_cursor_lstep4();
        }
        else if(f == 'move_cursor_rstep1'){
            move_cursor_rstep1();
        }
        else if(f == 'move_cursor_rstep2'){
            move_cursor_rstep2();
        }
        else if(f == 'move_cursor_rstep3'){
            move_cursor_rstep3();
        }
        else if(f == 'move_cursor_rstep4'){
            move_cursor_rstep4();
        }
        else if(f == 'split_segment_at_cursor'){
            split_segment_at_cursor(cursortime, split_line_margin);
        }
        else if(f == 'merge_with_following_segment'){
            merge_with_following_segment(wmap);
        }
        else if(f == 'set_active_transcript_line_to_prev'){
            set_active_transcript_line_to_prev();
        }
        else if(f == 'set_active_transcript_line_to_next'){
            set_active_transcript_line_to_next();
        }
        else if(f == 'upload_transcript'){
            upload_transcript();
        }
        else if(f == 'set_mode_to_cursor'){
            set_mode('cursor');
        }
        else if(f == 'move_window_lstep1'){
            move_window_lstep1();
        }
        else if(f == 'move_window_lstep2'){
            move_window_lstep2();
        }
        else if(f == 'move_window_lstep3'){
            move_window_lstep3();
        }
        else if(f == 'move_window_lstep4'){
            move_window_lstep4();
        }
        else if(f == 'move_window_rstep1'){
            move_window_rstep1();
        }
        else if(f == 'move_window_rstep2'){
            move_window_rstep2();
        }
        else if(f == 'move_window_rstep3'){
            move_window_rstep3();
        }
        else if(f == 'move_window_rstep4'){
            move_window_rstep4();
        }
        else if(f == 'move_selection_lstep1'){
            move_selection_lstep1();
        }
        else if(f == 'move_selection_lstep2'){
            move_selection_lstep2();
        }
        else if(f == 'move_selection_lstep3'){
            move_selection_lstep3();
        }
        else if(f == 'move_selection_lstep4'){
            move_selection_lstep4();
        }
        else if(f == 'move_selection_rstep1'){
            move_selection_rstep1();
        }
        else if(f == 'move_selection_rstep2'){
            move_selection_rstep2();
        }
        else if(f == 'move_selection_rstep3'){
            move_selection_rstep3();
        }
        else if(f == 'move_selection_rstep4'){
            move_selection_rstep4();
        }
        else if(f == 'play_current_span_and_add_transcript_line_and_activate'){
            play_current_span_and_add_transcript_line_and_activate();
        }
        // else if(f == 'info'){
        //     console.log(waveform.datainfo);
        // }
        else if(f == 'set_active_transcript_line_to_next_and_play_current_span'){
            set_active_transcript_line_to_next_and_play_current_span();
        }
        else{
            if(waveform[f]) console.log(f)
            if(waveform[f]) waveform[f](o.e);
            else  console.log(`no function ${f}`)
        }
    }
    let open_deletem = false;
    set_urls(source_uid).then(function(o){
        // const docid = o.wav.replace(/.*\//,'').replace(/\.(wav|flac)[:AB]?/,'');
        // postp('/redactions', { wav: docid }).then((x) => {
        //     const b = x.ok != 0;
        //     redactions.set(docid, b);
        //     if(b){
        //         postp('/redactions', { wav: docid, get: true }).then((x) => {
        //             redactions.set(docid, x.ok.sort((a,b) => a.beg - b.end));
        //         });
        //     }
        // });
        return get_audio_buffer_info(o.wav).then( (info) => audiof(info) );
    })
    .then( () => {
        if(two) set_audio_element_with_array(docids, set_urls) // for _A _B case
        else    set_audio_element(source_uid, stereo, set_urls);
    } )
    .then( () => check_stereo() )
    .then( () => {
        if(stereo !== null){
            two = stereo;
            // force update to underlines
            if(two) times.update( (x) => x );
            if(two) redacted_selection_height *= 2;
        }
        activate(0);
    } )
    .then( () => set_times_then_draw(0, 10) );

    function check_stereo(){
      if(stereo !== null){
        // clearInterval(interval);
        if(stereo){
          const k = source_uid;
          docid = k + ':A';
          docids[0] = docid
          docids[1] = k + ':B';
          wave_docid = docid;
        }
      }
      return stereo;
    }


    const un1 = active_channel.subscribe( (x) => activate(x) );
    const un2 = srcs.subscribe( (x) => srcs_update(x) );
    const un3 = times.subscribe( (x) => {
        wave_display_offset = x.wave_display_offset;
        wave_display_length = x.wave_display_length;
        // if(width != x.width && wave_display_length){
        //     width = x.width;
        // }
        draw_ticks();
        let ew = width / duration;
        scrollbar_x = wave_display_offset * ew;
        scrollbar_width = wave_display_length * ew;
        // event.dispatch(this, 'drew_scroll_cursor');
        if(wave_display_length) draw_waveformi(0);
        if(two) draw_waveformi(1);
        srcs_update(srcso);
        window.srcso = srcso;
        visible_redactions = find_redactions();

        selection_beg_x = convert_seconds_to_pixels_by_offset(wave_selection_offset);
        selection_end_x = convert_seconds_to_pixels_by_offset(wave_selection_end);

    } );
    const un4 = selection.subscribe( (x) => {
        wave_selection_offset = x.wave_selection_offset;
        wave_selection_length = x.wave_selection_length;
        wave_selection_end = x.wave_selection_end;
        wave_selection_src = {
            beg: wave_selection_offset,
            end: wave_selection_offset + wave_selection_length
        };
        selection_beg_x = convert_seconds_to_pixels_by_offset(wave_selection_offset);
        selection_end_x = convert_seconds_to_pixels_by_offset(wave_selection_end);
        let selection_widthx = selection_end_x - selection_beg_x;
        let ww = convert_seconds_to_pixels(wave_selection_length);
        if (selection_widthx!=ww && ww!=0) event.dispatch(selection_rect, 'drew_selection');
        // selection_width = ww;
    } );
    // const un5 = mouse.subscribe( (x) => {
    //     draw_cursor();
    //     set_selection_from_mouse();
    // } );
    onDestroy( () => {
        un1();
        un2();
        un3();
        un4();
        unsubscribe_settings();
        unsubscribe_sections();
        unsubscribe_segments();
        unsubscribe_undefined_segments();
    } );

    function draw_bufferi(k){
        const ch = JSON.parse(k).id.match(/[:_]B$/) ? 1 : 0;
        const canvas = ch == 0 ? canvas0 : canvas1;
        const ctx = ch == 0 ? ctx0 : ctx1;
        canvas.width = width; //t.width;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if(samples_per_pixel > samples_per_pixel_threshold){
            draw_waveform2(ctx, get_cache(k));
        }
        else{
            draw_waveform3(ctx, get_cache(k));
        }
    }

    function draw_waveform2(ctx, points){
        const half_height = wave_canvas_height / 2;
        const quarter_height = half_height / 2;
        const three_quarters_height = half_height + quarter_height;
        // ctx.moveTo 0, half_height
        const scale =  width / ( wave_buffer_sample_rate * wave_display_length );
        let midpoint;
        if(false && stereo){
            midpoint = quarter_height;
        }
        else{
            midpoint = half_height;
        }
        if(!line){
            // console.log "drawing to #{width}"
            for(let i = 0; i <= width; i += sample_skip){
                let ii = i * 2;
                let mx = points[ii] * midpoint;
                // assume min/max symmetry for the moment
                let mn;
                if(max_only){
                    mn = mx * -1;
                }
                else{
                    mn = points[ii+1] * midpoint;
                }
                ctx.moveTo(i, midpoint + mn);
                ctx.lineTo(i, midpoint + mx);
                if(false && stereo){
                    // assume min/max symmetry for the moment
                    if(max_only){
                        mx = points[ii] * quarter_height;
                    }
                    ctx.moveTo(i, three_quarters_height - mx);
                    ctx.lineTo(i, three_quarters_height + mx);
                }
            }
        }
        // if display.line is false
        //     for i in [0..display.points.length-1]
        //         x = i / samples_per_pixel
        //         if display.max_only is true
        //             mx = display.points[i] * midpoint
        //         ctx.lineTo x, midpoint + mx
        ctx.stroke()
    }

    function draw_waveform3(ctx, points){
        const pixels_per_sample = 1 / samples_per_pixel;
        const half_height = wave_canvas_height / 2;
        const quarter_height = half_height / 2;
        const three_quarters_height = half_height + quarter_height;
        // ctx.moveTo 0, half_height
        const scale =  width / ( wave_buffer_sample_rate * wave_display_length );
        let midpoint;
        if(false && stereo){
            midpoint = quarter_height;
        }
        else{
            midpoint = half_height;
        }
        if(!line){
            // console.log "drawing to #{width}"
            for(let i = 0; i <= points.length/2; i += 1){
                let ii = i*2;
                let mx = points[ii] * midpoint;
                ctx.lineTo(i*pixels_per_sample, midpoint + mx);
            }
        }
        ctx.stroke();
    }




    const cache2 = {};
    function draw_buffer(k){
        lastk = k;
        if(disable_waveform) return;
        draw_bufferi(k);
        if(spectrogram_open) spectrogram.draw_buffer(get_scache(k));
    }
    // settings.subscribe( (x) => {
    //     if(x.key != 'settings') return;
    //     console.log('settings')
    //     console.log(x);
    //     // if(x.wave_canvas_height) wave_canvas_height = x.wave_canvas_height;
    //     // tick().then( () => spectrogram.draw_buffer(cache[lastk]) );
    //     spectrogram_open = x.spectrogram_open;
    //     if(spectrogram_open) tick().then( () => spectrogram.draw_buffer(scache[lastk]) );
    // })
    function create_audio_hash_from_docid(docid){
        return {
            id: docid,
            btime: round_to_3_places(wave_display_offset),
            etime: round_to_3_places(wave_display_offset + wave_display_length),
            header: header,
            header_size: header_size,
            sample_rate: sample_rate,
            block_size: block_size
        };
    }
    function create_audiok_from_docid(docid){
        const audiok = {
            id: docid,
            btime: round_to_3_places(wave_display_offset),
            etime: round_to_3_places(wave_display_offset + wave_display_length)
        };
        return JSON.stringify(audiok);
    }
    function draw_waveformi(i){
        const audio = create_audio_hash_from_docid(docids[i]);
        const k = create_audiok_from_docid(docids[i]);
        // if(!wave_buffer_sample_rate) return;
        // clear_buffer()
        // if(wave_docid.match(/^s3:/)) return;
        if(cache2[k]){
            if(debug) console.log(`cache hit ${k}`);
            if(k != lastk){
                draw_buffer(k, i);
                // if(two){
                //     const docid2 = wave_docid.replace(/_A/g, '_B').replace(':A', ':B');
                //     draw_buffer(create_audiok_from_docid(docid2), 'B', t);
                // }
            }
        }
        else{
            if(debug) console.log(cache2);
            // cache2[k] = true;
            get_audio_buffer_helperi(k, audio);
            // if(wave_docid.match(/_A.wav$/)){
                // two = true;
            // if(two){
            //     w.update_cursor = true;
            //     // w.update_scrollbar = true;
            //     // w.update_underlines = true;
            //     w.update_play_head = true;
            //     // w.update_ticks = true;
            //     // w.update_tick_times = true;
            // 
            //     const docid2 = wave_docid.replace(/_A/g, '_B').replace(':A', ':B');
            //     get_audio_buffer_helper(create_audiok_from_docid(docid2), create_audio_hash_from_docid(docid2), 'B', t);
            // }
        }
        lastk = k;
    }
    function get_audio_buffer_helperi(k, audio){
        const w = null;
        get_audio_buffer_for_waveform(w, audio).then( (buffer) => {
            fill_cache(k, buffer, width, w, wave_canvas_height, sample_skip, samples_per_pixel_threshold);
            cache2[k] = true;
            draw_buffer(k);
        } );
    }



    export function get_mode(){ return mode }
    export function set_mode(x){
        if (x === mode) {
            return;
        }
        if(mode === 'beg' || mode === 'end'){
            mouseup_x = mousemove_x;
            set_mousedown_false();
        }
        mode = x;
        // window.$('.mode').text(x);
        if (x === 'beg' || x === 'end') {
            if (wave_selection_offset === null) {
                set_current_selection(convert_pixels_to_seconds(mousemove_x), 0);
            }
            switch (x) {
                case 'beg':
                    return set_mode_beg_end(convert_seconds_to_pixels(wave_selection_offset - wave_display_offset));
                case 'end':
                    return set_mode_beg_end(convert_seconds_to_pixels(wave_selection_end - wave_display_offset));
            }
        }
    }
  

    // sets an endpoint for the selection
    // actually just sets the mousedown flag, but logically sets the start point
    function set_mousedown_true(){
        mousedown_b = true;
        mouseup_x = false;
        mousemove_x = false;
        wave_adjust_time = wave_adjust_btime || wave_adjust_etime;
        if(debug){
          console.log('updatedown');
          console.log(wave_adjust_btime)
        }
        return true;
    }

    // sets a selection in concert with set_mousedown_true
    // only function that calls wave_update
    function set_mousedown_false() {
        // var b, e, length, mouseup_time, offset, p2s, w;
        // w = this;
        console.log('a');
        if(!mousedown_b){ return; }
        console.log('b');
        console.log(wave_adjust_time);
        if(wave_adjust_time){
            if(mousemove_x){
                const mouseup_time = convert_pixels_to_seconds(mouseup_x) + wave_display_offset;
                if(wave_adjust_btime){
                    if(mouseup_time < wave_selection_end){
                        wave_update(mouseup_time, wave_selection_end - mouseup_time);
                    }
                }
                else{
                    if(wave_selection_offset < mouseup_time){
                        wave_update(wave_selection_offset, mouseup_time - wave_selection_offset);
                    }
                }
            }
        }
        else{
            let b;
            let e;
            // the user can make the selection in either direction,
            // so here we normalize so begin is always less than end
            if(mouseup_x > mousedown_x){
                b = mousedown_x;
                e = mouseup_x;
            }
            else{
                b = mouseup_x;
                e = mousedown_x;
            }
            const p2s = convert_pixels_to_seconds; // only relative to visible region
            // the following only works if the displayed region didn't change,
            // in other words scrolling didn't occur during selection
            const offset = convert_pixels_to_seconds(b) + wave_display_offset;
            const length = convert_pixels_to_seconds(e - b);
            wave_update(offset, length);
        }
        if(debug){
            console.log('updateup');
        }
        mousedown_b = false;
        wave_adjust_time = false;
        wave_adjust_scroll = false;
        return keyboard.focus();
    }

    let wave_active_transcript_line = false;
    // current selection == internal selection times
    // normally there's no difference between the visible selection and the "current" selection
    // when the mouse is down, there is a distinction, and this function syncs them back up,
    // changing the current selection to match the visible selection.
    // optionally modifies a transcript line as well to match this "current" selection (if there's an active line)
    // sets wave_selection_offset wave_length and wave_selection_end, and adjusts transcript line timestamps
    function wave_update(span_offset, span_length) {
        span_offset = round_to_3_places(span_offset);
        span_length = round_to_3_places(span_length);
        if (debug) { //@debug
            console.log('update');
            console.log(span_offset);
            console.log(span_length);
            console.log(wave_selection_offset);
            console.log(wave_selection_length);
        }
        const span_end = round_to_3_places(span_offset + span_length);
        if (debug) {
            if (wave_active_transcript_line) {
                console.log("active line before is " + wave_active_transcript_line.id.replace('node-', ''));
            } else {
                console.log("no active line");
            }
        }
        // this section handles updating a transcript line
        if (wave_selection_offset !== span_offset && wave_selection_end !== span_end) {
            console.log('setting to null');
            set_active_transcript_line_helper(null);
            if(document.querySelectorAll('.ChannelA.active_channel').length == 1){
                set_active_transcript_line(null);
            }
        }
        if ((wave_selection_offset !== span_offset || wave_selection_length !== span_length) && wave_active_transcript_line) {
            console.log(w.selector);
            let n = wmap.get(wave_active_transcript_line);
            console.log(n);
            if(xlass_def_id == 2){
                if(wave_selection_offset !== span_offset) update_node(wave_docid, n, span_offset, 'beg');
                if(wave_selection_end !== span_end)       update_node(wave_docid, n, span_end,    'end');
            }
            else{
                update_wave(wave_docid, n, span_offset, span_end);
            }
        }
        // end section
        set_current_selection(span_offset, span_length);
        if (debug) {
            if (wave_active_transcript_line) {
                return console.log("active line before is " + wave_active_transcript_line.id.replace('node-', ''));
            } else {
                return console.log('no active line');
            }
        }
    }

    export function set_current_selection(o, l) {
        console.log(`set current to ${o} ${l}`)
        if (o < 0 || l < 0 || o > duration || o + l > duration) {
            return;
        }
        selection.update( (x) => {
            return {
                wave_selection_offset: o,
                wave_selection_length: l,
                wave_selection_end: round_to_3_places(o + l)
            };
        } );
        // return w.update_cursor = true;
        // mouse.update( (x) => x );
    }

    // this.draw_underlines_audio_wave_docid()
    // function set_current_selection_by_src(src) {
    //     return this.set_current_selection(src.beg, this.round_to_3_places(src.end - src.beg));
    // }

    function set_mode_beg_end(x){
        mousemove_x = x;
        set_move_params();
        mousedown_x = x;
        set_mousedown_true();
    }

    function set_move_params(){
        if(
            (Math.abs(mousemove_x - convert_seconds_to_pixels(wave_selection_offset - wave_display_offset)) < 20) ||
            (Math.abs(mousemove_x - convert_seconds_to_pixels(wave_selection_end - wave_display_offset)) < 20)
        ){
            cursor_class = "col-resize";
        }
        else{
            cursor_class = "auto";
        }
        // return unless that.check_channel this
        wave_adjust_scroll = false;
        if(!wave_adjust_time){
            wave_adjust_btime = false;
            wave_adjust_etime = false;
            // if w.mousedown_x and w.mousedown_x isnt w.mouseup_x
            if(wave_selection_length !== null && wave_selection_length !== 0){
                if(true){ //Math.abs(e.clientY - rect.top - wave_canvas_height / 2) < 20
                    if(Math.abs(mousemove_x - convert_seconds_to_pixels(wave_selection_offset - wave_display_offset)) < 20){
                        wave_adjust_btime = true;
                    }
                    if(Math.abs(mousemove_x - convert_seconds_to_pixels(wave_selection_end - wave_display_offset)) < 20){
                        wave_adjust_etime = true;
                        wave_adjust_btime = false; // so they can't both be true
                    }
                }
            }
        }
        if(debug){
            let time = round_to_3_places(convert_pixels_to_seconds(mousemove_x) + wave_display_offset).toString();
            console.log(`updatemove ${time} seconds`);
        }
        if(mousedown_x && !(wave_autoscroll || mouseup_x)){
            autoscroll_jump();
        }
        // return w.update_cursor = true;
    }

    export function show_src(src, beg){
        if (debug === true) {
            console.log(`BEGIN ${beg}`);
            console.log(src);
        }
        //this.set_active_transcript_line this
        set_current_selection_by_src(src);
        // w.update_waveform_canvas false if web_audio
        if (beg === true) {
            if (src.beg > wave_display_offset && ((wave_display_offset + wave_display_length) > src.beg)) {
                return console.log('within');
            } else {
                // this.update_waveform_canvas true # can the arg be false?
                console.log('without');
                console.log(`beg ${src.beg}`);
                return center_display_at_time(src.beg);
            }
        } else {
            if (src.end > wave_display_offset && ((wave_display_offset + wave_display_length) > src.end)) {
                return console.log('within');
            } else {
                // this.update_waveform_canvas true # can the arg be false?
                console.log('without');
                console.log(`beg ${src.end}`);
                return center_display_at_time(src.end);
            }
        }
    }

    function set_active_transcript_line_helper(id){
        if (debug) { //@debug is true
            console.log("NODE");
            console.log(id);
        }
        if (!id) {
            id = null;
        }
        let same;
        if (id && wave_active_transcript_line === id) {
            same = true;
        } else {
            same = false;
        }
        wave_active_transcript_line = id;
        if (id) {
            const node_id = wmap.get(id);
            if(debug){
                console.log("active line is " + id + ':' + node_id);
                console.log(wmap);
            }
            if (same === false) {
                const srcc = index2.get(id.split('-')[1]);
                activate_docid(srcc.docid);
                const src = {
                    beg: srcc.beg,
                    end: srcc.end
                };
                show_src(src, true);
                if(false){// (this.debug === true) {
                    console.log('showing source');
                    console.log(src);
                }
                window.ldc.crnt = node_id.split('-')[1];
            }
        } else {
            if(debug) console.log("no active line");
            window.ldc.crnt = null;
        }
    }

    // function set_active_transcript_line(id, dont_focus){
    //     if (window.$('.ChannelA.active_channel').length !== 1) {
    //         return;
    //     }
    //  
    //     set_active_transcript_line_helper(id);
    //     if (!w.segments) {
    //         w.segments = w.interface.segments;
    //     }
    //     console.log(w.segments);
    //     return w.segments.set_active_transcript_line(id, dont_focus);
    // }

    // these also set it on the waveform
    function set_active_transcript_line_to_next_and_play_current_span(){
        if (document.querySelector('.ChannelA.active_channel').length !== 1) {
            return;
        }
        // Need a timeout otherwise next line is overwritten with (formerly) active transcript!
        setTimeout(function() {
            const ids = set_active_transcript_line_to_next();
            set_active_transcript_line_helper(ids.id);
            play_current_span();
        }, 200);
    }

    function play_current_span_and_add_transcript_line_and_activate(){
        // set_active_transcript_line_helper(id);
        const f = () => set_active_transcript_line_to_last_created();
        play_current_span_and_add_transcript_line(f);
    }

    function play_current_span_and_add_transcript_line(f) {
        play_current_span();
        const aa = '.SegmentList';
        const bb = 'new.Segment';
        check_for_submit( () => add_transcript_line_based_on_selection_without_submit(aa, bb), f );
    }

    function set_current_selection_by_src(src){
        set_current_selection(src.beg, round_to_3_places(src.end - src.beg));
    }

    export function move_cursor(x, factor){
        console.log('helping1');
        console.log(x);
        const step = convert_seconds_to_pixels(x * factor);
        mousemove_x = cursor_x + step;
        set_move_params();
        // selection.update( (x) => x );
    }

    export function move_selection(x, factor){
        console.log('helping2');
        console.log(x);
        const step = convert_seconds_to_pixels(x * factor);
        set_mousedown_true();
        mousemove_x = cursor_x + step;
        set_move_params();
        set_selection_from_mouse();
        // selection.update( (x) => x );
    }

    export function move_window(x, factor){
        // set_times_then_draw protects against out of range
        set_times_then_draw(wave_display_offset + (x * factor), wave_display_length);
        // event.dispatch(null,"moved_window");
    }
    let zoom;
    // keep center point the same, but toggle between step size of .5s and .2s
    export function toggle_zoom() {
        zoom = !zoom;
        let z;
        if (zoom) {
            z = 0.005;
        } else {
            z = 0.0125;
        }
        let c;
        if (wave_selection_offset) {
            c = wave_selection_offset + wave_selection_length / 2;
        } else {
            c = wave_display_offset + wave_display_length / 2;
        }
        const ww = z * width;
        set_times_then_draw(c - ww / 2, ww);
    }

    export function zoom_in() {
        const q = wave_display_length / 4;
        let r;
        if (wave_selection_offset) {
            r = set_times_then_draw(wave_selection_offset + wave_selection_length / 2 - q, q * 2);
        } else {
            r = set_times_then_draw(wave_display_offset + q, q * 2);
        }
        // event.dispatch(null,'zoomed_in');
    }

    export function zoom_out() {
        let r;
        if (wave_selection_offset) {
            r = set_times_then_draw(wave_selection_offset + wave_selection_length / 2 - wave_display_length, wave_display_length * 2);
        } else {
            r = set_times_then_draw(wave_display_offset - wave_display_length / 2, wave_display_length * 2);
        }
        // event.dispatch(null,'zoomed_out');
    }

  function mousemove(e){
        const x = e.clientX - this.getBoundingClientRect().left;
        // mouse.update( (m) => {
            set_mode('cursor');
            mousemove_x = x;
            set_move_params();
            set_selection_from_mouse();
            // return m;
        // } );
    }

    function mousedown0(e){
        activate(0);
        mousedown_helper(e, this);
    }

    function mousedown1(e){
        activate(1);
        mousedown_helper(e, this);
    }

    function mousedown(e){
        mousedown_helper(e, this);
    }
    
    function mousedown_helper(e, that){
        create_action('down');
        const x = (e.clientX - that.getBoundingClientRect().left);
        // mouse.update( (m) => {
            set_mode('cursor');
            mousedown_x = x;
            set_mousedown_true();
            // return m;
        // } );
    }


  function mouseup(e){
        const x = e.clientX - this.getBoundingClientRect().left;
        // mouse.update( (m) => {
            set_mode('cursor');
            mouseup_x = x;
            set_mousedown_false();
            // return m;
        // } );
    }


    export function cursor_time(){
        return cursortime;
    }
    function draw_waveform_line(x){
        if(x < 0 || x > width){
            return;
        }
        // $("#{selector} .play-head").attr('x1', x)
        cursorx = x;
        cursortime = convert_pixels_to_seconds(cursorx) + wave_display_offset;
        text = round_to_3_places(cursortime).toString();
    }

    function set_selection_from_mouse(){
        if(mousedown_x && ! mouseup_x){
            if(mousemove_x && ( mousedown_x != mousemove_x )){
                let epix;
                if(wave_adjust_time){
                    if(wave_adjust_btime){
                        // epix = selection_beg_x + selection_width;
                        if(mousemove_x > selection_end_x) selection_beg_x = selection_end_x;
                        else                              selection_beg_x = mousemove_x;
                        // selection_width = epix - selection_beg_x;
                        // epix = convert_seconds_to_pixels(wave_selection_end-wave_display_offset);
                    }
                    else{
                        // selection_beg_x = convert_seconds_to_pixels(wave_selection_offset-wave_display_offset);
                        // epix = mousemove_x;
                        if(mousemove_x < selection_beg_x) selection_end_x = selection_beg_x;
                        else                              selection_end_x = mousemove_x;
                    }
                    // event.dispatch(null,'adjusted_time');
                    // const ww = epix - selection_beg_x;
                    // if (selection_width!=ww && ww!=0)
                    // event.dispatch(selection_rect, 'drew_selection');
                    // selection_width = ww;
                }
                else{
                    if(mousedown_x < mousemove_x){
                        selection_beg_x = mousedown_x;
                        selection_end_x = mousemove_x;
                    }
                    else{
                        selection_beg_x = mousemove_x;
                        selection_end_x = mousedown_x;
                    }
                    const ww = selection_end_x - selection_beg_x;
                    // if (selection_width!=ww && ww!=0) event.dispatch(selection_rect, 'drew_selection');
                    // if (ww!=0) event.dispatch(selection_rect, 'drew_selection');
                    // selection_width = ww;
                }
            }
        }
    }

    function draw_play_head(){
        // if(!active) return;
        // width = width;
        // height = wave_canvas_height;
        const draw_time = true; // i == 0;
        // adds 50 ms or more to draw play head
        playheadx = convert_seconds_to_pixels(play_head - wave_display_offset);
        // canvas = $(selector)[0]
        // ctx = canvas.getContext "2d"
        // ctx.clearRect 0, 0, canvas.width, canvas.height
        // ctx.beginPath()
        // @draw_waveform_line @selector_play_head, x, 'green', draw_time


        if(playheadx < 0 || playheadx > width){
            return;
        }
        if(draw_time){
            playheadtext = round_to_3_places(convert_pixels_to_seconds(playheadx)+wave_display_offset).toString();
        }
    }
    playheads.set(0, draw_play_head);



    function srcs_update(o){
        srcso = o;
        let x = draw_underlines(docid, o);
        if(x){
            underlines0a = x.a;
            underlines0height = x.height;
        }
        // width = line_obj.underlines_width;
        if(two){
            x = draw_underlines(docids[1], o);
            if(x){
                underlines1a = x.a;
                underlines1height = x.height;
            }
        }
    }

    //this function draws the underlines for a given line
    function draw_underlines(docid, srcs){
        let max_level = 0;
        if(srcs[docid] == undefined) return false; // No underlines: force refresh
        //cycle through the sources and find the maximum level
        // for(const k in srcs[docid]){
        //     let src = srcs[docid][k];
        //     if(src.level > max_level){
        //         max_level = src.level;
        //     }
        // }
        // console.log max_level
        const line_obj = {}
        // data.line_obj = line_obj;
        // line_obj.underlines_width = width;
        // line_obj.underlines_selector = '.waveform-underlines';
        //cycle through the sources for this line, compute the width and offset, and draw the underline
        // console.log('U1');
        // console.log(srcs);
        line_obj.a = [];
        for(const k in srcs[docid]){
            // console.log('U2');
            let src = srcs[docid][k];
            // console.log(src)
            if(src.end >= wave_display_offset && src.beg <= (wave_display_length + wave_display_offset)){
                // console.log 'U3'
                if(src.level > max_level) max_level = src.level;
                let offset = ( src.beg - wave_display_offset ) / wave_scale;
                let width = ( src.end - src.beg ) / wave_scale;
                if(debug){
                    console.log("DEBUG");
                    console.log(src);
                    console.log(offset);
                    console.log(width);
                }
                let aa = draw_underline(offset, width, src.level, src.node);
                if(aa){
                    line_obj.a.push(aa);
                }
            }
        }
        //calculate the height based on the maximum level, width based on the line width
        line_obj.height = (max_level + 1) * (underline_height * 2 + 1);
        return line_obj;
    }
    function draw_underline(offset, width, depth, node_id){
        // console.log "U4 #{offset} #{width} #{node_id}" if @debug
        let underline_color = 'blue';
        // depth = depth * ( underline_height * 2 + 1 )
        depth = depth * ( underline_height + 5 + 1 ); // instead of doubling, just add 5
        let o = {
            node_id: node_id,
            class: `node-${node_id}`,   // Necessary to match underlines with segments in tutorial
            width: width,
            // height: @underline_height
            x: offset,
            y: depth,
            fill: underline_color
        }
        return o;
    }
    function underline(x){
        let id;
        id = wrmap.get(`node-${window.ldc.nodes.get(parseInt(x.node_id)).parent_iid}`);
        set_active_transcript_line_helper(id);
        if(document.querySelectorAll('.ChannelA.active_channel').length == 1){
            set_active_transcript_line(id);
        }
        play_current_span();
    }
    function keyp(e){}




    function draw_ticks(){
        // let step = Math.floor(wave_scale*8000) / 200; // part of this operation is scaling, and part is arbitrary step frequency
        let step = wave_display_length / 40;
        step1 = wave_scale;
        step2 = step;
        step3 = step2 * 2;
        step4 = step3 * 3;
        step2 = step * 2 / 5;
        const a = [];
        const ww = wave_display_length / width;
        for(let i = 1; i < 40; i++){
            let ii = round_to_6_places(i*step);
            let x = ii / ww;
            if(x >= 0 && x <= width){
                let o = { x: x };
                if(i % 2 == 0){
                    o.time_x = x;
                    o.text = '123.4';
                }
                a.push(o);
            }
        }
        if(a.length){
            for(let i = 1; i < 40; i++){
                let ii = round_to_3_places(i*step+wave_display_offset);
                if(i % 2 == 0){
                    a[i-1].text = ii.toString();
                }
            }
        }
        ticks = a;
    }

    // const vars = window.ldc.vars;
    // const aa = `.${vars.add_from_waveform_list}`;
    // const bb = `new.${vars.add_from_waveform_audio}`;

    // function add_transcript_line_based_on_selection(){
    //     check_for_submit( () => add_transcript_line_based_on_selection_without_submit(aa, bb), null );
    // }

    // function add_transcript_line_based_on_play_head(){
    //     check_for_submit( () => add_transcript_line_based_on_play_head_without_submit(aa, bb), null );
    // }
    function add_transcript_line_based_on_selection_without_submit(list_selector, audio_path){
        const span = {
            offset: wave_selection_offset,
            length: wave_selection_length
        };
        if(redact) span.transcript = 'REDACTED';
        return add_audio_to_list(wave_docid, list_selector, audio_path, span);
    }
    
    function play_src_with_audio_for_waveform(src, f){
        console.log('AUDIO')
        console.log(source_uid);
        play_src_with_audio_id(source_uid, src, f);
    }
    
    export function play_current_span_or_play_stop(){
        if(wave_selection_length == 0)
            play_stop();
        else
            play_current_span();
    }

    function play_stop(){
        if(is_playing())
            stop_playing();
        else
            play_from_play_head();
    }

    function play_from_play_head(){
        const src = {
            beg: play_head,
            end: duration
        };
        play_src_with_audio_for_waveform(src, () => null);
    }

    export function play_current_span(){
        if(wave_selection_length == 0){
            alert('select a region first');
        }
        else{
            play_src_with_audio_for_waveform(wave_selection_src, () => null);
        }
    }

    export function play_from_cursor(){
        play_head = convert_pixels_to_seconds(cursor_x) + wave_display_offset;
        play_from_play_head();
    }

    export function play_from_selection_beg(){
        if(wave_selection_offset){
            play_head = wave_selection_offset;
            play_from_play_head();
        }
    }

    export function play_from_selection_end(){
        if(wave_selection_offset){
            play_head = wave_selection_offset + wave_selection_length;
            play_from_play_head();
        }
    }





    function mousemove_underlines(e){
        wave_adjust_scroll = false;
    }

    function mousemove_ticks(e){
        wave_adjust_scroll = false;
    }

    // this function wraps center_display_at_time, but determines the
    // location based on the scrollbar as a representation for the full file
    function scrollf(x) {
        let noffset = round_to_3_places(x / width * duration);
        let max = round_to_3_places(duration - wave_display_length / 2);
        if(noffset > max){
            noffset = max;
        }
        let min = round_to_3_places(wave_display_length / 2);
        if(noffset < min){
            noffset = min;
        }
        center_display_at_time(noffset);
        return console.log(`scroll ${wave_adjust_scroll}`);
    };
    // this handler would enable true scrolling, rather than just jumping
    // $(w.selector).on 'mousemove', '.waveform-scrollbar', (e) ->
    //     # return unless that.check_channel this
    //     return unless wave_adjust_scroll
    //     # selector = '.waveform-scrollbar'
    //     # rect = $(selector)[w.active_channel].getBoundingClientRect()
    //     rect = this.getBoundingClientRect()
    //     w.mousemove_x = e.clientX - rect.left
    //     scrollf w.mousemove_x
    function mousedown_scrollbar(e){
        return wave_adjust_scroll = true;
    }
    function mouseup_scrollbar(e) {
        if(debug){
            console.log("mousemove_x");
            console.log(w);
        }
        // return unless that.check_channel this
        if(!wave_adjust_scroll){
            return;
        }
        // selector = '.waveform-scrollbar'
        // rect = $(selector)[w.active_channel].getBoundingClientRect()
        const rect = this.getBoundingClientRect();
        mouseup_x = e.clientX - rect.left;
        scrollf(mouseup_x);
        wave_adjust_scroll = false;
        keyboard.focus();
    }

    function center_display_at_time(c){
        // console.log 'centering at ' + c
        // console.log 'display length: ' + wave_display_length
        if(debug){
            console.log(`center ${c}`);
        }
        let b = c - wave_display_length / 2;
        set_times_then_draw(b, wave_display_length);
    }

    export function move_cursor_lstep1(){ move_cursor(step1, -1); }
    export function move_cursor_lstep2(){ move_cursor(step2, -1); }
    export function move_cursor_lstep3(){ move_cursor(step3, -1); }
    export function move_cursor_lstep4(){ move_cursor(step4, -1); }
    export function move_cursor_rstep1(){ move_cursor(step1, 1); }
    export function move_cursor_rstep2(){ move_cursor(step2, 1); }
    export function move_cursor_rstep3(){ move_cursor(step3, 1); }
    export function move_cursor_rstep4(){ move_cursor(step4, 1); }
    export function move_selection_lstep1(){ move_selection(step1, -1); }
    export function move_selection_lstep2(){ move_selection(step2, -1); }
    export function move_selection_lstep3(){ move_selection(step3, -1); }
    export function move_selection_lstep4(){ move_selection(step4, -1); }
    export function move_selection_rstep1(){ move_selection(step1, 1); }
    export function move_selection_rstep2(){ move_selection(step2, 1); }
    export function move_selection_rstep3(){ move_selection(step3, 1); }
    export function move_selection_rstep4(){ move_selection(step4, 1); }
    export function move_window_lstep1(){ move_window(step3, -1); }
    export function move_window_lstep2(){ move_window(wave_display_length, -0.5); }
    export function move_window_lstep3(){ move_window(wave_display_length, -1); }
    export function move_window_lstep4(){ move_window(wave_display_length, -2); }
    export function move_window_rstep1(){ move_window(step3, 1); }
    export function move_window_rstep2(){ move_window(wave_display_length, 0.5); }
    export function move_window_rstep3(){ move_window(wave_display_length, 1); }
    export function move_window_rstep4(){ move_window(wave_display_length, 2); }

    function autoscroll_jump() {
        const ww = width / 100;
        const jump = ww * 50;
        const s = convert_pixels_to_seconds(jump);
        if(mousemove_x < ww && mousedown_x > ww){
            if(s < wave_display_offset){
               mousedown_x += jump;
               set_times_then_draw(wave_display_offset - s, wave_display_length);
            }
            wave_autoscroll = true;
        }
        else if(width - mousemove_x < ww && width - mousedown_x > ww){
            if(s + wave_display_offset + wave_display_length < duration){
                mousedown_x -= jump;
                set_times_then_draw(wave_display_offset + s, wave_display_length);
            }
            wave_autoscroll = true;
        }
        else{
            wave_autoscroll = false;
        }
        if(wave_autoscroll){
            setTimeout(function() {
                autoscroll_jump();
            }, 1000);
        }
    }

    // let check_redactions = setInterval( () => {
    //     if(!redactions.has(redactiondocid)) return;
    //     const r = redactions.get(redactiondocid);
    //     if(r && r !== true){
    //         all_redactions = r;
    //         visible_redactions = find_redactions();
    //         clearInterval(check_redactions);
    //     }
    // }, 500);

    function find_redactions(){
        const some = [];
        for(const r of all_redactions){
            let wave_display_end = wave_display_offset + wave_display_length;
            if(r.beg < wave_display_end && r.beg > wave_display_offset){
                let x = r.beg < wave_display_offset ? wave_display_offset : r.beg;
                let y = r.end > wave_display_end ? wave_display_end : r.end;
                some.push({
                    redacted_selection_x: convert_seconds_to_pixels(x - wave_display_offset),
                    redacted_selection_width: convert_seconds_to_pixels(y - x),
                    redacted_selection_beg_text: x,
                    redacted_selection_end_text: y
                });
            }
        }
        return some;
    }

    let dialog_command;
    let dialog_main;
    const dialog_main_a = [
        'Waveform',
        'Text Input',
        'Playback',
        'Services',
        'Open Guidelines'
    ];
    const dialog_main_keys = {
        "1": "show_help_screen_waveform",
        "2": "show_help_screen_input",
        "3": "show_help_screen_playback",
        // # "4": "show_help_screen_edit",
        "4": "show_help_screen_services",
        "5": "open_guidelines",
        '/': 'special_settings'
    };
    function dialog_main_keydown(e){
        dialog_main.close();
        if(Object.keys(dialog_main_keys).includes(e.key)) show(dialog_main_keys[e.key]);
        else keyboard.focus();
        // waveform.help_screen_message('unknown choice');
    }
    let dialog_waveform;
    const dialog_waveform_keys = { h: "main" };
    function dialog_waveform_keydown(e){
        dialog_waveform.close();
        if(Object.keys(dialog_waveform_keys).includes(e.key)) show(dialog_waveform_keys[e.key]);
    }
    let dialog_input;
    function dialog_input_keydown(e){
        dialog_input.close();
        if(Object.keys(dialog_waveform_keys).includes(e.key)) show(dialog_waveform_keys[e.key]);
    }
    let dialog_playback;
    function dialog_playback_keydown(e){
        dialog_playback.close();
        if(Object.keys(dialog_waveform_keys).includes(e.key)) show(dialog_waveform_keys[e.key]);
    }
    let dialog_services;
    const dialog_services_keys = {
        "h": "main",
        '1': "add_sad",
        '2': "add_asr"
    };
    function dialog_services_keydown(e){
        dialog_services.close();
        if(Object.keys(dialog_services_keys).includes(e.key)) show(dialog_services_keys[e.key]);
    }
    let dialog_sad;
    let dialog_asr;
    let dialog_upload_transcript;
    let dialog_download_transcript;
    let dialog_close_kit;
    let dialog_close_kit_audit;
    let done_comment;
    let broken_comment;
    function dialog_close_kit_donef(){
        let c = null;
        if(done_comment && done_comment.length) c = done_comment;
        done(c);
    }
    function dialog_close_kit_brokenf(){
        let c = null;
        if(broken_comment && broken_comment.length) c = broken_comment;
        broken(c);
    }
    let dialog_delete_all;
    let dialog_delete_all2;
    const delete_all_docids = { all: [] };
    function delete_all2_wrapper(){
        delete_all2(delete_all_docids.all);
        dialog_delete_all2.close();
    }
    if(open_deletem){
        let found_two = false;
        // document.querySelectorAll('.Segment').forEach( (x) => {
        //     let docid = window.$(x).data().value.docid;
        //     if(docid.match(/:/)){
        //         found_two = true;
        //         if(delete_all_docids[docid]){
        //             delete_all_docids[docid].push(docid);
        //         }
        //         else{
        //             delete_all_docids[docid] = [ docid ];
        //         }
        //         delete_all_docids.all.push(docid);
        //     }
        //     console.log(delete_all_docids)
        // });
        if(found_two && !stereo) dialog_delete_all2.showModal();
    }
    let dialog_settings;
    let dialog_settings_h = {};
    // each one needs to be saved in save_settings in settings.js
    const dialog_settings_a = [
        [ 'open', 'q' ],
        [ 'sections_open', 'a' ],
        [ 'spectrogram_open', 'b' ],
        [ 'experimental', 'x' ]
    ];
    let dialog_delete_section;
    function dialog_settings_keydown(e){
        for( let y of dialog_settings_a ){
            let k = y[0];
            let v = y[1];
            if(e.key == v){
                settings.update( (x) => { x[k] = !x[k]; return x } );
            }
        }
        if(e.key == 'q') keyboard.focus();
    }
    let sections_open;
    const unsubscribe_settings = settings.subscribe( (x) => {
        experimental = x.experimental;
        if(dialog_settings){
            if(x.open) dialog_settings.showModal();
            else       dialog_settings.close();
        }
        sections_open = x.sections_open;
        for( let y of dialog_settings_a ){
            let k = y[0];
            let v = y[1];
            dialog_settings_h[k] = x[k];
        }
    });
    
    let dialog_spectrogram;
    let command_line;
    let command_line_enter = false;
    function command(f){
        dialog.showModal();
    }
    async function process_command_line(c, b){
        if(b){
            console.log(c);
            if(c == 'sad'){
                let x = await add_sad_send(source_uid);
                console.log(x);
            }
            if(c == 'asr'){
                let x = await add_asr_send(source_uid);
                console.log(x);
            }
            command_line_enter = false;
            return c;
        }
        return null;
    }
    $: command_line_output = process_command_line(command_line, command_line_enter);
    $: console.log(`command line output: ${command_line_output}`);
    let keyboard;
    export function keyboard_focus(e){
        e.preventDefault();
        keyboard.focus();
    }
    function keydown(e){
        e.preventDefault();
        const x = fmap_helper(false, null, e, keymap[mode]);
        if(x) userf(x, e);
    }
    function find_segment(){
        for( let [ k, v ] of set_playing_transcript_line_index){
            let e = v[0];
            let segment = v[1];
            if(k <= play_head && e >= play_head) return segment;
        }
    }
    function find_segment2(){
        const index = set_playing_transcript_line_index;
        let found = 0;
        // console.log "INDEX"
        // console.log index
        for( let [ k, v ] of index ){
            let e = v[0];
            let segment = v[1];
            if(play_head < k){
                break;
            }
            else{
                if(k <= play_head && e >= play_head){
                    found = null;
                    break;
                }
                if(e <= play_head){
                    found = segment;
                    found = e;
                }
            }
        }
        return found;
    }
    function sample_calculations(x, y){
        if(!wave_buffer_sample_rate) return; // audio might not be loaded yet
        wave_display_length_in_samples = convert_seconds_to_samples(y);
        wave_display_offset_in_samples = convert_seconds_to_samples(x);
        samples_per_pixel = wave_display_length_in_samples / width;
    }
    const cache = {};
    const scache = {};
    function fill_cache(k, buffer, width, w, wave_canvas_height, sample_skip, samples_per_pixel_threshold){
        let b = samples_per_pixel > samples_per_pixel_threshold;
        let i = k.match(/[:_]B/) ? 1 : 0;
        let x = fill_waveform_display_points(buffer, w, wave_canvas_height, i, !b, sample_skip);
        cache[k] = x[0];
        scache[k] = x[1];
    }
    function get_cache(k){
        return cache[k];
    }
    function get_scache(k){
        return scache[k];
    }
    function fill_waveform_display_points(buffer, w, wave_canvas_height, i, line, sample_skip){
        // that = this
        // wave_display_length_in_samples = convert_seconds_to_samples wave_display_length
        // wave_display_offset_in_samples = convert_seconds_to_samples wave_display_offset
        // samples_per_pixel = wave_display_length_in_samples / width
        const half_height = wave_canvas_height / 2;
        const pixels_per_sample = 1 / samples_per_pixel;
        const ii = stereo ? i : 0;
        const wave_buffer_channel_data = buffer.getChannelData(ii);
        const points = [];
        if(line){
            for(let i = 0; i < wave_buffer_channel_data.length; i += 1){
                let ii = i*2;
                points[ii] = wave_buffer_channel_data[i];
                points[ii+1] = 0;
            }
        }
        else{
            for(let i = 0; i <= width; i += sample_skip){
                let ii = i*2;
                // wave_buffer_channel_data_i = Math.floor(i*samples_per_pixel+wave_display_offset_in_samples)
                let wave_buffer_channel_data_i = Math.floor(i*samples_per_pixel);
                // x = wave_buffer_channel_data[wave_buffer_channel_data_i]
                let mx = 0;
                let mn = 0;
                for(let iii = 0; iii < samples_per_pixel; iii += 1){
                    let xx = wave_buffer_channel_data[wave_buffer_channel_data_i+iii];
                    if(xx > mx) mx = xx;
                    if(xx < mn) mn = xx;
                }
                // points[ii] = if mx > Math.abs(mn) then mx else mn
                points[ii] = mx;
                points[ii+1] = mn;
                // if display.max_only is true
                //     display.points[ii+1] = x
                // if(false && stereo == true){
                //     x = wave_buffer_channel_data2[wave_buffer_channel_data_i]
                //     waveform_display.points2[ii] = x
                //     if waveform_display.max_only is true
                //         waveform_display.points2[ii+1] = x
            }
        }
        scale_points(points);
        return [ points, wave_buffer_channel_data ];
    }
    function scale_points(points){
        let mx = 0;
        let mn = 0;
        // let mx = Math.max(...points);
        // let mn = Math.min(...points);
        for(let i = 0; i < points.length; i++){
            if(points[i] > mx) mx = points[i];
            mn = Math.abs(points[i]);
            if(mn > mx) mx = mn;
        }
        for(let i = 0; i < points.length; i++ ) points[i] /= mx;
    }



    let last_audio;
    let last_buffer;
    function convert_seconds_to_samples(seconds){
        return Math.floor(seconds * wave_buffer_sample_rate);
    }
    let wave_display_length_in_samples;
    let wave_display_offset_in_samples;
    function get_audio_buffer_for_waveform(w, audio){
        let this_audio = [ audio.id.replace(/:[AB]$/, ''), audio.btime, audio.etime ].join(':');
        if(this_audio == last_audio){
            return Promise.resolve(last_buffer);
        }
        return get_audio_buffer(audio).then( (buffer) => {
            console.log(`SR ${buffer.sampleRate}`);
            wave_buffer_sample_rate = buffer.sampleRate;
            // helper.sample_calculations();
            wave_display_length_in_samples = convert_seconds_to_samples(wave_display_length);
            wave_display_offset_in_samples = convert_seconds_to_samples(wave_display_offset);
            samples_per_pixel = wave_display_length_in_samples / width;
            last_audio = this_audio;
            last_buffer = buffer;
            return buffer;
        } );
    }
    function get_audio_buffer(audio){
        // # url = "/audio_files2?audio_id=#{audio.id}&beg=#{audio.btime}&end=#{audio.etime}"
        // # get url, (data) ->
        // #     audio_context.decodeAudioData(data).then (data) ->
        // #         data
        // # url = "#{bucket}#{audio.id}.wav"
        const unit = audio.block_size;
        // # unit = 1
        // sr = 16000
        // sr = 8000
        const sr = audio.sample_rate;
        const header_size = audio.header_size;
        const b = Math.floor(audio.btime * sr) * unit + header_size;
        const e = Math.floor(audio.etime * sr) * unit + header_size - 1;
        
        return new Promise( (resolve, reject) => {
            const urls = window.ldc.resources.urls;
            const k = (audio.uid || audio.id).replace(/:[AB]/,'');
            // return set_urls(k).then( (x) => {
            return getp_wav(urls[k], b, e).then( (data) => {
                const a = new Uint8Array(header_size + data.byteLength);
                console.log('HEAD');
                console.log(audio);
                a.set( new Uint8Array(audio.header), 0 );
                a.set( new Uint8Array(data), header_size );
                const f1 = (data) => resolve(data);
                decode_audio_data(a.buffer, f1);
                // # audio_context.decodeAudioData(a.buffer).then (data) ->
                // #     resolve(data)
            } );
            // } );
        } ) ;
    }
    function get_audio_buffer_info(k){
        // # url = "/audio_files2?audio_id=#{audio.id}&info=true"
        // # get url, (data) ->
        // #     data
        // # url = "#{bucket}#{audio.id}.wav"
        return new Promise( (resolve, reject) => {
            // ldc_nodes.wait_for_root_key_key( "resources", "urls", () => {
            set_urls(k).then( (x) => {
                const url = x.wav_url;
                // urls = $('.Root').data().resources.urls
                // const urls = window.ldc.resources.urls;
                // const url = urls[audio.uid || audio.id];
                // console.log(JSON.stringify(urls));
                // console.log(urls);
                // console.log(audio);
                getp_wav(url, 0, 8191).then( (header) => {
                    // # url = "#{bucket}#{audio.id}.json"
                    console.log("header ", header);
                    // const url = urls[audio.uid || audio.id]
                    console.log(url);
                    const ret = {};
                    const parser = new ParseB('name');
                    ret.info = parser.parse(header);
                    console.log(ret);
                    getp_wav(url, 0, ret.info.dataOffset-1).then( (data) => {
                        console.log("data2 ",  data);
                        ret.header = data;
                        resolve(ret);
                    } );
                } );
            } );
        } );
    }
    function audiof(data){
        header = data.header;
        header_size = data.info.dataOffset;
        stereo = data.info.channels > 1;
        duration = data.info.duration;
        sample_rate = data.info.sample_rate;
        block_size = data.info.blockSize;
    }

    function focus(x){ x.focus() }

    let sections_table;
    const sections_table_columns = [
        [ 'Name', 'name', 'col-4' ],
        [ 'Begin', 'beg', 'col-4' ],
        [ 'End', 'end', 'col-4' ]
    ];
    if(xlass_def_id == 2){
        sections_table_columns[1][1] = 'begr';
        sections_table_columns[2][1] = 'endr';
    }
    let sections_table_rows;
    const unsubscribe_sections = sections.subscribe( (x) => sections_table_rows = x );
    function close_sections(){
        settings.update( (x) => { 
            x.sections_open = false;
            return x;
        } );
    }
    function delete_selected_section(){
        let id = sections_table.get_selected_key();
        if(id){
            delete_section(sections_table.get_selected_key());
        }
        else{
            alert('no section selected');
        }
    }


    let segs = [];
    let undef = [];
    const unsubscribe_segments = segments.subscribe( (s) => {
        segs = s;
        if(debug){
            console.log('SEGMENTS');
            console.log(segs);
        }
        // redactf(segs);
    } );
    const unsubscribe_undefined_segments = undefined_segments.subscribe( (x) => undef = x );
    // function redactf(s){
    //     local_redactions.clear();
    //     for(let x of s){
    //         if(!local_redactions.has(x.docid)) local_redactions.set(x.docid, []);
    //         if(x.speaker == 'redacted'){
    //             local_redactions.get(x.docid).push(x);
    //         }
    //     }
    //     if(debug) console.log(local_redactions);
    // }
    let sfocus = true;
    let active = null;
    let last_active_segment;
    function set_active_transcript_line(id, dont_focus){
        let last = active;
        active = id;
        last_active_segment = id;
        sfocus = !dont_focus;
        return last;
    }
    function refocus(){
        let a = active;
        active = null;
        setTimeout( () => active = a, 100);
        sfocus = true;
    }
    function find_active_i(){
        let found = null;
        for(let i = 0; i < segs.length; i++){
            if(segs[i].id === active){
                found = i;
                break;
            }
        }
        return found;
    }
    export function find_active_id(){
        let found = find_active_i();
        let h = { id: segs[found].id }
        h.prev = found && found > 0 ? segs[found - 1].id : null;
        h.next = (found || found == 0) && found < segs.length - 1 ? segs[found + 1].id : null;
        return h;
    }
    function set_active_transcript_line_to_next(){
        if(segs.length == 0){
            return;
        }
        let found = find_active_i();
        let set = null;
        if(found || found == 0){
            if(found < segs.length - 1){
                set = found + 1;
            }
        }
        else{
            set = 0;
        }
        return set_active_transcript_line_wrapper(set, found);
    }
    function set_active_transcript_line_to_prev(){
        if(segs.length == 0){
            return null;
        }
        let found = find_active_i();
        let set = null;
        if(found || found == 0){
            if(found > 0){
                set = found - 1;
            }
        }
        else{
            set = segs.length - 1;
        }
        return set_active_transcript_line_wrapper(set, found);
    }
    function set_active_transcript_line_wrapper(set, found){
        let h = {}
        if(set || set == 0){
            h.id = segs[set].id;
            h.last = set_active_transcript_line(h.id, false);
        }
        else{
            h.id = segs[found].id;
            h.last = h.id;
        }
        return h;
    }
    // assumes SegmentListItem was the last thing created
    function set_active_transcript_line_to_last_created(){
        let id = window.ldc.last_children[0];
        if(!id) return;
        id = parseInt(id.split(':')[0]);
        id = segmap.get(id);
        if(!id) return;
        set_active_transcript_line(id.id, false);
        return id;
    }
    let rtl = constraint_rtl;
    function change_handle(){
        update_segments();
        // validate_transcript();
    }
    function click_transcript_line(e){
        if(debug){
            console.log(e);
            console.log(this.id);
        }
        set_active_transcript_line(this.id);
        if(debug) console.log(this.dataset.iid);
        set_mode('cursor');
        set_active_transcript_line_helper(this.id);
    }
    function pad(x){
        let s = String(x);
        let dec = s.split('.')[1];
        if(!dec){
            s += '.000';
        }
        else{
            if(dec.length == 2) s += '0';
            if(dec.length == 1) s += '00';
        }
        return s;
    }

    function fill_speakerm(speakerm, short, speakers){
        let i = 0;
        // unnecessary?  maybe just short[i] unneeded
        for(const [x, v] of speakers){
            if (x && !speakerm[x]) {
                speakerm[x] = short[i];
            }
            i++;
        }
    }

    function fill_speakers(speakerm, short, speakers, kb){
        let i = 0;
        for(let x in speakerm){
            const c = short[i];
            i++;
            speakers.push([c, x]);
            kb.map[c] = `setf_${c}`;
            kb.delegate[kb.map[c]] = () => x;
        }
    }

    function set_speaker(h){
        let id;
        if(window.ldc.nodes) id = h.iid + 3;
        else                 id = window.gdata(`#node-${h.iid} .Speaker`).meta.id;
        const kb = new Keyboard('speakers');
        kb.map = {};
        const short = kb.shortcuts();
        const speakerm = {};
        let spkrs = constraint_speakers;
        const speakers = [];
        const new_label = 'new speaker';
        const replace_label = 'replace speaker';
        if (spkrs) {
            if (spkrs[0] === 'new') {
                kb.set_speaker_helper_new_helper(new_label, speakers);
                spkrs = spkrs.slice(1, spkrs.length);
            }
            for(let i = 0; i < short.length; i++) speakerm[spkrs[i]] = short[i];
        } else {
            kb.set_speaker_helper_new_helper(new_label, speakers);
            kb.set_speaker_helper_replace_helper(replace_label, speakers);
        }
        fill_speakerm(speakerm, short, speakersm);
        fill_speakers(speakerm, short, speakers, kb);
        help_screen.open({
            title: 'Speakers',
            list: speakers,
            keyboard: kb,
            remove: true,
            reset: true,
            mini: true
        }).then( (x) => {
            if(x == 'getf'){ //get_new_speaker(id, h);
                const kb = new Keyboard('speaker');
                return input_screen.open_helper({
                    keyboard: kb,
                    title: 'type speaker, hit enter'
                });
            }
            else{
                return x;
            }
        } ).then( (x) => {
            if(x == 'replacef') return x;
            else if(x)          return set_speaker_value(id, x, redactcb, h.nodes);
        } ).then( (x) => {
            if(x == 'replacef'){
                for(let x of [ 'n', 'r' ]){
                    delete kb.map[x];
                    delete kb.delegate[x];
                }
                return help_screen.open({
                    title: `Replace ${h.speaker} with:`,
                    list: speakers.slice(2),
                    keyboard: kb,
                    remove: true,
                    reset: true,
                    mini: true
                });
            }
        } ).then( (x) => {
            if(x) set_speaker_value_replace(h.speaker, x);
        } );
    }

    function open_section(h){
        if(constraint_section_order_forced === true){
            section_order_forced_open(h);
        }
        else {
            open_section2(h);
        }
    }

    function open_section2(h){
        // let id;
        // if(window.ldc.nodes) id = h.iid + 3;
        // else                 id = window.gdata(`#node-${h.iid} .Speaker`).meta.id;
        const kb = new Keyboard('sections');
        kb.map = {};
        const short = kb.shortcuts();
        const speakerm = {};
        let spkrs = constraint_sections;
        const speakers = [];
        const new_label = 'new section';
        // const replace_label = 'replace section';
        if (spkrs) {
            if (spkrs[0] === 'new') {
                kb.set_speaker_helper_new_helper(new_label, speakers);
                spkrs = spkrs.slice(1, spkrs.length);
            }
            for(let i = 0; i < short.length; i++) speakerm[spkrs[i]] = short[i];
        } else {
            kb.set_speaker_helper_new_helper(new_label, speakers);
            // kb.set_speaker_helper_replace_helper(replace_label, speakers);
        }
        fill_speakerm(speakerm, short, sectionsm);
        fill_speakers(speakerm, short, speakers, kb);
        help_screen.open({
            title: 'Sections',
            list: speakers,
            keyboard: kb,
            remove: true,
            reset: true,
            mini: true
        }).then( (x) => {
            if(x == 'getf'){ //get_new_speaker(id, h);
                const kb = new Keyboard('section');
                return input_screen.open_helper({
                    keyboard: kb,
                    title: 'type section, hit enter'
                });
            }
            else{
                return x;
            }
        } ).then( (x) => {
            if(x == 'replacef') return x; // won't happen
            else if(x)          return open_sectionf(h.iid, x);
        } ); //.then( (x) => {
        //     if(x == 'replacef'){
        //         for(let x of [ 'n', 'r' ]){
        //             delete kb.map[x];
        //             delete kb.delegate[x];
        //         }
        //         return help_screen.open({
        //             title: `Replace ${h.speaker} with:`,
        //             list: speakers.slice(2),
        //             keyboard: kb,
        //             remove: true,
        //             reset: true,
        //             mini: true
        //         });
        //     }
        // } ).then( (x) => {
        //     if(x) set_speaker_value_replace(h.speaker, x);
        // } );

            // getf: () => get_new_section(hh),
            // setf: (value) => open_sectionf(hh.iid, value),
    }

    function suserf(e, x){
        const o = { userf: e.detail.userf, e: e.detail.e };
        const h = { iid: x.iid, help_screen: help_screen, input_screen: input_screen };
        h.rf = () => redactcb();
        h.nodes = x.nodes;
        h.speaker = x.speaker;
        // if(window.ldc.nodes && e.detail.userf.match(/section/)){
        //     alert('the section feature is broken');
        //     return;
        // }
        if(e.detail.userf == 'set_speaker')        set_speaker(x);
        else if(e.detail.userf == 'show_sections')  show_sections();
        else if(e.detail.userf == 'open_section')  open_section(x);
        else if(e.detail.userf == 'close_section') close_section(h);
        else if(e.detail.userf == 'validate_transcript') validate_transcript();
        else if(e.detail.userf == 'play_head_menu')      play_head_menu(h);
        else if(e.detail.userf == 'delete_active_transcript_line') control_d(x);
        else if(e.detail.userf == 'generic_next')                  generic_next(x);
        else if(e.detail.userf == 'tag_unintelligible')            save_unintelligible(e, x);
        else if(e.detail.userf == 'split_segment_at_cursor')            split_segment_at_cursor(cursortime, split_line_margin);
        else if(e.detail.userf == 'merge_with_following_segment')            merge_with_following_segment(waveform.map);
        else if(e.detail.userf == 'play_current_span') play_current_span();
        else if(e.detail.userf == 'set_active_transcript_line_to_prev') userf(e.detail.userf, e);
        else if(e.detail.userf == 'set_active_transcript_line_to_next') userf(e.detail.userf, e);
        else if(e.detail.userf == 'set_active_transcript_line_to_next_and_play_current_span') userf(e.detail.userf, e);
        else if(e.detail.userf == 'play_current_span_and_add_transcript_line_and_activate') play_current_span_and_add_transcript_line_and_activate();
        else                                                       dispatch('userf', o);
    }
    function generic_next(x){
        if(experimental) xasr2();
    }
    
    let deleteb = false;
    function control_d(){
        // console.log('d');
        deleteb = true;
        setTimeout( () => deleteb = false, 3000 );
    }
    function delete_active_transcript_line(){
        const x = set_active_transcript_line(null);
        // dispatch something
        if(x) delete_transcript_line_based_on_segment_id(waveform.map, x, true);
        deleteb = false;
    }

    function show_sections(){
        settings.update( (x) => {
            x.sections_open = !x.sections_open;
            return x;
        } );
    }
    let help_screen;
    let input_screen;

    let service_promise;
    let output_promise;
    function get1(text){
        const o = { type: 'validate_transcript', data: { text: text } };
        const set_sp = (x) => service_promise = x;
        const set_op = (x) => output_promise = x;
        output_promise = Promise.resolve({ errors: ['validating...'] });
        get_promises(set_sp, set_op, o);
    }
    let transcript;
    $: if(transcript) get1(transcript);
    let include_headers = false;
    let include_speaker = true;
    let include_section = true;
    let kit = kit_id;
    function validate_transcript(){
        if(output_promise){
            output_promise = null;
        }
        else{
            transcript = create_transcript(kit, include_speaker, include_section, include_headers, segs);
            transcript = transcript.replace(/\t\n/g, "\tx\n");
        }
    }
    function play_head_menu(h){
        // kb = this.keyboards.playback;
        // if (w.special) {
        //   kb.map.p = 'close';
        //   return kb.show_mini_screen(w, false);
        // } else {
          // delete kb.map.p;
          const hh = {
            // html: help_screen.playback,
            html: 'help_screen_playback_html',
            remove: true,
            reset: true,
            mini: true,
            map: map,
            delegate: waveform
          };
          h.help_screen.open(hh);
        // }
    }
    function display_docid(x){
        if(!x) return '';
        return x.replace(/(s3:)?[^:]+:?/, '');
    }
    let redact_mode = false;
    let redact_from = "";
    let redact_text = "";
    let redact_edit;
    let redact_beg;
    let redact_end;
    let redact_iid;
    let dialog;
    function select_redaction(){
        let x = window.getSelection();
        if(x.type == 'Range' && x.anchorNode.textContent == x.focusNode.textContent){
            let b = x.anchorOffset;
            let e = x.focusOffset;
            if(b > e){
                let x = b;
                b = e;
                e = x;
            }
            for(let i = b; i > -1; i--){
                if(redact_from.substring(i, i+1).match(/\s/)) break;
                b = i;
            }
            for(let i = e; i < redact_from.length+1; i++){
                if(redact_from.substring(i-1, i).match(/[\s,.]/)) break;
                e = i;
            }
            redact_beg = b;
            redact_end = e - 1;
            redact_text = redact_from.substring(b, e);
            redact_edit = redact_from.substring(0, b) + '<redact>' + redact_text + '</redact>' + redact_from.substring(e);
        }
    }
    function save_redactionf(){
        dialog.close();
        const value = redact_text;
        const iid = current_segment_iid();
        active = null;
        if(debug){
            console.log(iid);
            console.log(redact_iid);
        }
        save_redaction(iid, redact_text, redact_iid, redact_edit);
        // if(window.ldc.nodes){
        //     window.ldc.segmap.get(iid-2).nodes.get('Transcription').node_value.set( { value: value } );
        //     if(redact_edit) window.ldc.segmap.get(parseInt(redact_iid)-2).nodes.get('Transcription').node_value.set( { value: redact_edit } );
        //     segs = segs;
        // }
    }
    function current_segment_iid(){
        return parseInt(index_segments_by_id.get(last_active_segment).iid) + 2;
    }
    function redactcb(){
        redact_mode = window.ldc.vars.last_speaker_used == 'redacted';
        if(redact_mode){
            window.ldc.vars.last_speaker_used = window.ldc.vars.penultimate_speaker_used;
            redact_from = get_redact_from();
            if(redact_from){
                setTimeout(() => dialog.showModal(), 100);
            }
            else{
                if(redact_from !== '') alert('no overlapping segment');
                redact_mode = false;
            }
        }
        else{
            dialog.close();
        }
    }
    function get_redact_from(){
        if(!redact_mode) return "";
        let b = 0;
        let e = 0;
        let aseg;
        for(const x of segs){
            if(x.id == last_active_segment){
                aseg = x;
                // b = x.beg;
                // e = x.end;
                break;
            }
        }
        let rseg;
        for(const x of segs){
            if(x.id != last_active_segment && x.beg <= aseg.beg && x.end >= aseg.end){
                rseg = x;
                b = x.beg;
                e = x.end;
                break;
            }
        }
        if(!rseg) return false;
        redact_iid = (parseInt(rseg.iid) + 2).toString();
        return rseg.text;
    }
    let asrp;
    let asro = {};

    function xasr(asr){
        // if(!asrp) asrp = add_asr_sendx2(waveform.docid)
        if(!asrp) asrp = add_asr_sendx(waveform.docid)
        asrp.then( x => {
            asro = {};
            asro.i = 0;
            asro.segments = [];
            const items = new Map();
            for(let i = 0; i < x.results.speaker_labels.segments.length; i++){
                let y = x.results.speaker_labels.segments[i];
                asro.segments.push(y);
                for(let j = 0; j < y.items.length; j++){
                    let z = y.items[j];
                    // console.log(z)
                    let zz = `${z.start_time},${z.end_time},${z.speaker_label}`;
                    items.set(zz, z);
                }
                if(i == 2) break;
            }
            asro.items = x.results.items;
            let zzz;
            for(let i = 0; i < asro.items.length; i++){
                const z = asro.items[i];
                if(z.type == 'pronunciation'){
                    if(z.alternatives.length > 1){
                        asro.error = 'multiple alternatives';
                        break;
                    }
                    zzz = `${z.start_time},${z.end_time},${z.speaker_label}`;
                    // console.log(zz);
                    // console.log(items.get(zz))
                    if(items.has(zzz)){
                        items.get(zzz).token = z.alternatives[0].content;
                    }
                }
                if(z.type == 'punctuation'){
                    if(debug){
                        console.log('PPPP')
                        console.log(z);
                        console.log(zzz)
                    }
                    if(items.has(zzz)){
                        items.get(zzz).punc = z.alternatives[0].content;
                    }
                }
            //     if(!asro.segments.has(x.speaker_label)) asro.segments.set(x.speaker_label, []);
            }
            if(debug) console.log(asro);
            if(asro.error) console.error(asro.error);
            else           asro.show = true;
        } );
    }
    // function xasr3(){
    //  
    //     let segment = {
    //         tokens: [],
    //         text: ''
    //     };
    //     const x = asro.segments[asro.i];
    //     console.log('ASR')
    //     console.log(x);
    //     let s = '';
    //     for(let i = 0; i < x.items.length; i++){
    //         const z = x.items[i];
    //         s += z.token;
    //         if(z.punc) s += z.punc;
    //         if(i < x.items.length-1) s += ' ';
    //     }
    //     console.log(s)
    //     asro.i++;
    // }
    let last_end;
    function xasrskip(){
        last_end = segs[segs.length-1].end
        for(let i = asro.i; i < asro.items.length; i++){
            const x = asro.items[i];
            if(x.type == 'pronunciation'){
                if(parseFloat(x.start_time) > last_end) break;
            }
            asro.i = i;
        }
    }
    // function xasr3(){
    //  
    //     let segment = {
    //         tokens: [],
    //         text: ''
    //     };
    //     const x = asro.segments[asro.i];
    //     console.log('ASR')
    //     console.log(x);
    //     let s = '';
    //     for(let i = 0; i < x.items.length; i++){
    //         const z = x.items[i];
    //         s += z.token;
    //         if(z.punc) s += z.punc;
    //         if(i < x.items.length-1) s += ' ';
    //     }
    //     console.log(s)
    //     asro.i++;
    // }
    function xasr2(){
        let segment = {
            tokens: [],
            text: ''
        };

        if(asro.i == asro.items.length){
            alert('finished');
            return;
        }
        for(let i = asro.i; i < asro.items.length; i++){
            const x = asro.items[i];
            // console.log('ASR')
            // console.log(x);

        // for(let i = asro.i; i < asro.items.length; i++){
        //     const x = asro.items[i];
        //     console.log('ASR')
        //     console.log(x);

            if(!segment.beg){
                segment.beg = parseFloat(x.start_time);
                segment.speaker = x.speaker_label;
            }
            asro.i = i;
            if(segment.speaker == x.speaker_label){
                if(x.type == 'pronunciation'){
                    if(segment.end && x.start_time - segment.end > 0.25) break;
                    segment.end = parseFloat(x.end_time);
                    // segment.tokens.push(x.alternatives);
                    if(segment.text.length) segment.text += ' ';
                    segment.text += x.alternatives[0].content;
                }
                if(x.type == 'punctuation'){
                    // segment.punc = x.alternatives[0].content;
                    // asr_items_i++;
                    // break;
                    // segment.tokens.push(x.alternatives);
                    segment.text += x.alternatives[0].content;
                }
                // asro.i = i;
            }
            else{
                break;
            }
        }
        // if(segment.tokens.every( x => x.length == 1)){
        //     segment.text = segment.tokens.map( x => x[0].content ).join(' ');
        //     if(segment.punc) segment.text += segment.punc;
        // }

        segment.docid = docid;
        segment.offset = segment.beg;
        segment.transcript = segment.text;
        const f = () => {
            // asr_segments.delete(segment.speaker);
            // ldc_nodes.add_message_listitem('SegmentList', vals);
            // const id = parseInt(window.ldc.last_children[0].split(':')[0]);
            // const idd = window.ldc.segmap.get(id).id;
            // set_active_transcript_line(idd);
            const ids = set_active_transcript_line_to_last_created();
            set_active_transcript_line_helper(ids.id);
            play_current_span();
        };
        add_audio_to_listp(segment.docid, segment, f);
    }

    if(window.ldc.nodes){
        setInterval(
            () => {
                return;
                let check = 'true';
                const checkf = (x) => { check = x; console.error(check); }
                getp(`/kits/${window.ldc.obj.kit_id}/check?check=${check}`).then(
                    (data) => {
                        // console.log(data)
                        check = 'ok';
                        if(window.ldc.obj.xlass_def == 2){
                        if(data.ns.length == window.ldc.nmap.size){
                            for(const x of data.ns){
                                for(const s of [ 'n' ]) if(x[s] === null) x[s] = '';
                                const s = window.ldc.nodes.get(x.iid);
                                let y = s.nodes.get('N').value;
                                if(x.graph != y.docid) checkf('bad graph');
                                if(x.time != y.beg) checkf('bad time');
                            }
                        }
                        else{
                            checkf('bad number of ns');
                        }
                        if(data.segments.length == window.ldc.segmap.size){
                            for(const x of data.segments){
                                for(const s of [ 'arc', 'text', 'speaker' ]) if(x[s] === null) x[s] = '';
                                const s = window.ldc.nodes.get(x.iid);
                                let y = s.nodes.get('Arc').value;
                                if(x.begn != y.beg) checkf('bad seg beg');
                                if(x.endn != y.end) checkf('bad seg end');
                                y = s.nodes.get('Text').value;
                                if(x.text != y.value) checkf('bad text');
                                y = s.nodes.get('Speaker').value;
                                if(x.speaker != y.value) checkf('bad speaker');
                            }
                        }
                        else{
                            checkf('bad number of segments');
                        }
                        if(data.sections.length == window.ldc.secmap.size){
                            for(const x of data.sections){
                                for(const s of [ 'arc', 'name' ]) if(x[s] === null) x[s] = '';
                                const s = window.ldc.nodes.get(x.iid);
                                let y = s.nodes.get('Arc').value;
                                if(x.begn != y.beg) checkf('bad sec beg');
                                if(x.endn != y.end) checkf('bad sec end');
                                y = s.nodes.get('Name').value;
                                if(x.name != y.value) checkf('bad name');
                            }
                        }
                        else{
                            checkf('bad number of sections');
                        }
                        // console.log('check finished');
                        // console.log(check)
                        }
                        else{
                            if(data.segmentos.length == window.ldc.segmap.size){
                                for(const x of data.segmentos){
                                    const s = window.ldc.nodes.get(x.iid);
                                    let y = s.nodes.get('Segment').value;
                                    if(x.docid != y.docid) checkf('bad docid');
                                    if(x.begr != y.beg) checkf('bad beg');
                                    if(x.endr != y.end) checkf('bad end');
                                    y = s.nodes.get('Transcription').value;
                                    if(x.text != y.value) checkf('bad text');
                                    y = s.nodes.get('Speaker').value;
                                    if(x.speaker != y.value) checkf('bad speaker');
                                }
                            }
                            else{
                                checkf('bad number of segments');
                            }
                            if(data.sectionos.length == window.ldc.secmap.size){
                                for(const x of data.sectionos){
                                    const s = window.ldc.nodes.get(x.iid);
                                    let y = s.nodes.get('Section').value;
                                    if(x.section != y.value) checkf('bad section');
                                    y = s.nodes.get('BegSeg').value;
                                    if(x.begseg != y.value) checkf('bad begseg');
                                    y = s.nodes.get('EndSeg').value;
                                    if(x.endseg != y.value) checkf('bad endseg');
                                }
                            }
                            else{
                                checkf('bad number of sections');
                            }                            
                        }
                    }
                )
            }
            , 1000
        )
    }

    let speakersm;
    let sectionsm;
    export function update_segments_with(speakers, sections){
        speakersm = speakers;
        sectionsm = sections;
        update_segments();
        new_update_segments();
    }

    function update_segments(){
        if(window.ldc.node_lists) return;
        const o = segment_list_f('segments');
        segments.update( (x) => o.segments );
        undefined_segments.update( (x) => o.undefined_segments );
        sections.update( (x) => o.sections );
    }

    function update_segments2(json){
        json.map( (x) => x.readonly = true );
        index_segments(json);
        // let sections = Object.values(ns.index_sections_by_name);
        // ns.main.set_segments(json, sections, 'readonly');
        segments.update( (x) => json );
    }

    function segment_list_f(show){
        // if(!($(".ChannelA").length > 0)) return;
        const pair = create_segments();
        const segments = pair[0];
        const undefined_segments = pair[1];
        index_segments(segments);
        const sections = (function() {
            const ref = index_sections_by_name;
            const results = [];
            for (let k in ref) {
                let v = ref[k];
                results.push(v);
            }
            return results;
        })();
        if(debug){
            console.log("INDEX");
            console.log(index_sections_by_name);
            console.log('TEST');
            console.log(segments);
            console.log(sections);
        }
        const o = {
            segments: segments,
            undefined_segments: undefined_segments,
            sections: sections,
            show: show
        };
        return o;
        // ns.main.set_segments(segments, sections, show);
    }

    const index = new Map();
    let set_playing_transcript_line_index;
    const index2 = new Map();
    const index3 = new Map();
    const index_segments_by_id = new Map();
    const wmap = new Map();
    const wrmap = new Map();
    const segmap = new Map();
    const secmap = new Map();
    const nmap = new Map();
    const gmap = new Map();
    function index_segments(segments){
        index.clear();
        set_playing_transcript_line_index = index;
        index2.clear();
        index3.clear();
        index_segments_by_id.clear();
        wmap.clear();
        wrmap.clear();
        // active = set_active_transcript_line null
        let aactive = null;
        let aaactive = null;
        // if (active && document.querySelectorAll(`#${active}`).length) {
        //     aactive = String(window.$(`#${active}`).data().iid);
        // }
        let i;
        let j;
        let ref;
        let c1;
        for (i = j = 0, ref = segments.length; (0 <= ref ? j < ref : j > ref); i = 0 <= ref ? ++j : --j) {
            c1 = segments[i];
            c1.id = `segment-${i}`;
            index_segments_by_id.set(c1.id, c1);
            // that.index_segments_by_id[id] = c1
            let node_id = `node-${c1.iid}`;
            wmap.set(c1.id, node_id);
            wrmap.set(node_id, c1.id);
            index.set(c1.beg, [c1.end, c1.id]);
            index2.set(String(i), c1);
            index3.set(c1.id, String(i));
            if (aactive === String(c1.iid)) {
                // active = id if active is wmap[id]
                aaactive = c1.id;
            }
            c1.section = null;
        }
        if (document.querySelectorAll('.SectionList').length === 1) {
            let sss = null;
            create_section_index2();
            const all = Object.values(index_sections_by_name).sort( (a, b) => a.begr - b.begr );
            for(let i = 0; i < all.length; i++){
                let ss = all[i];
                if(!ss.endr){
                    if(i < all.length - 1) ss.endr = all[i+1].begr;
                    else                   ss.endr = 9999999;
                }
            }
            let l;
            let ref1;
            for (i = l = 0, ref1 = segments.length; (0 <= ref1 ? l < ref1 : l > ref1); i = 0 <= ref1 ? ++l : --l) {
                c1 = segments[i];
                // let ss = that.index_sections_by_segment_id[c1.id];
                // if (ss) {
                //   sss = ss;
                // }
                // c1.section = sss;
                // if (ss && ss.end === c1.id) {
                //   sss = null;
                // }
                for(let ss of all){
                    if(c1.beg >= ss.begr && c1.end <= ss.endr){
                        c1.section = ss;
                    }
                }
            }
        }
        add_source_audio_collision(docid);
        set_active_transcript_line_helper(aaactive);
        set_active_transcript_line(aaactive, true);
        if(debug){
            console.log('HERE');
            console.log(aactive);
            console.log(index2);
        }
        active = aactive;
    }

    let index_sections_by_segment_id = {};
    let index_sections_by_name = {};

    function create_section_index2(){
        const begmap = {};
        const endmap = {};
        index_sections_by_segment_id = {};
        index_sections_by_name = {};
        for(const [k, v] of secmap){
            let s;
            const x = window.ldc.nodes.get(k);
            const section = x.nodes.get("Name").value.value;
            const arc = x.nodes.get('Arc').value;
            const a = arc.beg;
            const b = arc.end;
            if (a && b && a === b) {
                // id = wrmap.get(`node-${a}`);
                // s = {
                //   name: section,
                //   beg: id,
                //   end: id,
                //   list_item_id: x.iid
                // };
                // if(that.index_segments_by_id.has(id)){
                //   s.begr = that.index_segments_by_id.get(id).beg;
                //   s.endr = that.index_segments_by_id.get(id).end;
                // }
                // else{
                //   console.log(`was segment ${id} deleted?`);
                // }
                // that.index_sections_by_segment_id[id] = s;
                // that.index_sections_by_name[section] = s;
            } else {
                if (a) {
                    // id = wrmap.get(`node-${a}`);
                    s = {
                        name: section,
                        // beg: id,
                        begr: nmap.get(a).beg,
                        list_item_id: x.iid
                    };
                    index_sections_by_name[section] = s;
                }
                if (b) {
                    // id = wrmap.get(`node-${b}`);
                    s = index_sections_by_name[section];
                    // s.end = id;
                    s.endr = nmap.get(b).beg;
                }
                if(!a && !b && !section){
                    s = {
                        name: section,
                        list_item_id: x.iid
                    };
                    index_sections_by_name[section] = s;
                }
            }
        }
    }

    function sources_object_add_node_helper(id, x){
        const data = {
            meta: {
            id: id
            },
            value: {
            docid: x.docid,
            beg: x.beg,
            end: x.end
            }
        };
        sources_object_add_node(null, data);
    }
    function new_update_segments(){
        if(!window.ldc.node_lists) return;
        if(xlass_def_id == 2){
            window.ldc.node_lists.get('NList').subscribe((x) => {
                let del = false;
                for(const [k, v] of nmap){
                    if(!x.has(k)){
                        del = true
                        v.Node();
                        nmap.delete(k);
                    }
                }
                let i = -1;
                for(const [k, v] of x){
                    i++;
                    if(nmap.has(k)){
                        // let c2 = segmap.get(k);
                        // c2.id = `unsorted-${i}`;
                        // tsegs.push(c2);
                    }
                    else{
                        // console.log(k)
                        // let s = v.nodes.get('Segment');
                        // console.log(s);
                        // const data = $(x).find(sel2).data();
                        // const src = data.value;
                        const c1 = {
                        }

                        nmap.set(k, c1);

                        c1.Node = v.nodes.get('N').node_value.subscribe( (x) => {
                            c1.docid = x.docid;
                            c1.beg = x.beg;
                            for(const [kk, v] of segmap){
                                if(v.begi == k){
                                    v.docid = x.docid;
                                    v.beg = x.beg;
                                    sources_object_add_node_helper(`${kk+1}`, v);
                                }
                                if(v.endi == k){
                                    v.docid = x.docid;
                                    v.end = x.beg;
                                    sources_object_add_node_helper(`${kk+1}`, v);
                                }
                            }
                            for(const [kk, v] of secmap){
                                if(v.begi == k) v.beg = x.beg;
                                if(v.endi == k) v.end = x.beg;
                            }
                            sort_segments();
                            sort_sections();
                        } );
                    }
                }
            });
        }
        window.ldc.node_lists.get('SectionList').subscribe((x) => {
            let del = false;
            for(const [k, v] of secmap){
                if(!x.has(k)){
                    del = true
                    v.Arc();
                    v.Name();
                    secmap.delete(k);
                    sort_segments();
                    sort_sections();
                }
            }
            // if(del) sort_segments();
            let i = -1;
            for(const [k, v] of x){
                i++;
                if(secmap.has(k)){
                }
                else{
                    const c1 = {
                        id: `unsorted-${i}`,
                        iid: k,
                        nodes: v.nodes
                    }

                    secmap.set(k, c1);
                    c1.Arc = v.nodes.get('Arc').node_value.subscribe( (x) => {
                        if(x.beg){
                            if(debug){
                                console.log(x)
                                console.log(nmap)
                            }
                            c1.begi = x.beg;
                            c1.endi = x.end;
                            c1.docid = nmap.get(x.beg).docid;
                            c1.beg = nmap.get(x.beg).beg;
                            c1.end = nmap.get(x.end).beg;
                            if(debug){
                                console.log('sort')
                                console.log(c1)
                                console.log(c1.beg)
                                console.log(x)
                                console.log(x.begi)
                            }
                            sort_segments();
                            sort_sections();
                        }
                    } );
                    // let y = v.nodes.get('Section');
                    // y.node_value.subscribe( (x) => {
                    c1.Name = v.nodes.get('Name').node_value.subscribe( (x) => {
                        c1.section = x.value;
                        sectionsm.set(x.value, x.value);
                        sort_segments();
                        sort_sections();
                    } );
                }
            }
        });
        window.ldc.node_lists.get('SegmentList').subscribe((x) => {
            let del = false;
            for(const [k, v] of segmap){
                if(!x.has(k)){
                    del = true
                    if(xlass_def_id == 2){
                        v.Arc();
                        v.Text();
                    }
                    else{
                        v.Segment();
                        v.Transcription();
                    }
                    v.Speaker();
                    segmap.delete(k);
                }
            }
            if(del) sort_segments();
            // const tsegs = [];
            // const tundef = [];
            let i = -1;
            for(const [k, v] of x){
                i++;
                if(segmap.has(k)){
                    // let c2 = segmap.get(k);
                    // c2.id = `unsorted-${i}`;
                    // tsegs.push(c2);
                }
                else{
                    // console.log(k)
                    // let s = v.nodes.get('Segment');
                    // console.log(s);
                    // const data = $(x).find(sel2).data();
                    // const src = data.value;
                    const c1 = {
                        id: `unsorted-${i}`,
                        iid: k,
                        // docid: '',
                        // beg: 0.001,
                        // end: 0.001,
                        text: '', // $(x).find(sel3).data().value.value || '',
                        speaker: '', //$(x).find(sel4).data().value.value || '',
                        section: null,
                        error: null,
                        nodes: v.nodes
                    }

                    segmap.set(k, c1);
                    if(xlass_def_id == 2){
                        c1.Arc = v.nodes.get('Arc').node_value.subscribe( (x) => {
                            if(x.beg){
                                if(debug){
                                    console.log(x)
                                    console.log(nmap)
                                }
                                c1.begi = x.beg;
                                c1.endi = x.end;
                                c1.docid = nmap.get(x.beg).docid;
                                c1.beg = nmap.get(x.beg).beg;
                                c1.end = nmap.get(x.end).beg;
                                if(debug){
                                    console.log('sort')
                                    console.log(c1)
                                    console.log(c1.beg)
                                    console.log(x)
                                    console.log(x.begi)
                                }
                                sources_object_add_node_helper(`${k+1}`, c1);
                                sort_segments();
                                sort_sections();
                            }
                        } );
                        c1.Text = v.nodes.get('Text').node_value.subscribe( (x) => {
                            c1.text = x.value;
                            sort_segments();
                        } );
                    }
                    else{
                        c1.Segment = v.nodes.get('Segment').node_value.subscribe( (x) => {
                            c1.docid = x.docid;
                            c1.beg = x.beg;
                            c1.end = x.end;
                            if(debug){
                                console.log('sort')
                                console.log(c1)
                                console.log(c1.beg)
                                console.log(x)
                                console.log(x.begr)
                            }
                            sources_object_add_node_helper(`${k+1}`, x);
                            sort_segments();
                            sort_sections();
                        } );
                        c1.Transcription = v.nodes.get('Transcription').node_value.subscribe( (x) => {
                            c1.text = x.value;
                        } );
                    }
                    c1.Speaker = v.nodes.get('Speaker').node_value.subscribe( (x) => {
                        c1.speaker = x.value;
                        speakersm.set(x.value, x.value);
                        segments.update( (x) => x );
                    } );
                    // let n1 = c1.text.match(/\(/g);
                    // if(!n1) n1 = [];
                    // let n2 = c1.text.match(/\)/g);
                    // if(!n2) n2 = [];
                    // if(c1.text && n1.length != n2.length) c1.error = "unbalanced parens";
                    // // if(c1.text && n1 && n2) c1.error = 'x'

                    // if(!c1.beg && c1.beg != 0){
                    //   tundef.push(k);
                    // }
                    // else{
                    //   segmap.set(k, c1);
                    //   tsegs.push(c1);
                    // }
                }
            }
                // tsegs.sort( (x, y) => x.beg - y.beg );
                // index_segments(tsegs, window.ldc.ns);
                // segments.update( (x) => tsegs );
                // undefined_segments.update( (x) => tundef );
        });
    }
    function sort_segments(){
        const tsegs = [];
        const tundef = [];
        for(const [k, v] of segmap){
            if(!v.beg && v.beg != 0){
                tundef.push(k);
            }
            else{
                tsegs.push(v);
            }
        }
        tsegs.sort( (x, y) => x.beg - y.beg );
        index_segments(tsegs);
        segments.set(tsegs);
        undefined_segments.set(tundef);
    }

    function sort_sections(){
        const ref = index_sections_by_name;
        const results = [];
        for (let k in ref) {
            let v = ref[k];
            results.push(v);
        }
        sections.set(results);
    }

    let t_value;
    let t_readonly;
    let t_iid;
    function t_blur(){
        if(t_timeout){
            clearTimeout(t_timeout);
            t_patch();
        }
    }
    function t_keydown(e, x){
        const userf = fmap_helper(false, null, e, inputmap);
        if(userf){
            suserf( { detail: { userf: userf, e: e } }, x);
        }

    }
    function t_init(input, x){
        input.focus();
        let sel = `#node-${x.iid} .Transcription`;
        t_readonly= x.readonly || x.text == "REDACTED";
        if(window.ldc.nodes){
            t_value = x.text;
            t_iid = x.iid + 2;
            if(t_readonly) console.log('readonly ' + x.text);
            tick().then( () => t_first = false );
        }
        else{
            window.wait_for(sel, () => {
                let d = window.gdata(sel);
                t_iid = d.meta.id;
                t_value = d.value;        
                if(t_value){
                    t_value = t_value.value;
                };
                if(t_readonly) t_value = x.text;
                if(t_readonly) console.log('readonly ' + x.text);
                tick().then( () => t_first = false );
            });
        }
    }
    let t_first = true;
    let t_timeout;
    function t_update(x){
        console.log(x)
        if(t_first) return;
        if(t_timeout) clearTimeout(t_timeout);
        t_timeout = setTimeout( t_patch , 1000 );
        console.log('done')
    }
    $: t_update(t_value);
    function t_patch(){
        if(t_timeout) clearTimeout(t_timeout);
        // if(window.ldc.nodes) transcription.nodes.get('Transcription').node_value.set( { value: value } );
        change_value(t_iid, t_value, change_handle);
    }
    if(t_readonly) t_value = x.text;

    let help_screen_hidden = true;
    let help_screen_mini;
    let help_screen_list = [];
    let help_screen_title = 'TITLE'
    let help_screen_keyboard;
    let help_screen_remove;
    let help_screen_reset;
    let help_screen_html;
    let help_screen_screen;
    let help_screen_map;
    let help_screen_delegate;
    let help_screen_resolvef;
    function help_screen_open(h){
        help_screen_hidden = false;
        help_screen_title = h.title;
        help_screen_keyboard = h.keyboard;
        help_screen_list = h.list;
        help_screen_remove = h.remove;
        help_screen_reset = h.reset;
        help_screen_html = h.html;
        help_screen_mini = h.mini;
        help_screen_map = h.map;
        help_screen_delegate = h.delegate;
        if(help_screen_map == 'delegate' && !help_screen_list){
            help_screen_map = help_screen_delegate.get_map();
            help_screen_list = [];
            for(let k in help_screen_map) help_screen_list.push([k, help_screen_map[k]]);
        }
        setTimeout(function(){
            help_screen_screen.focus();
        }, 100);
        return new Promise( (resolve, reject) => help_screen_resolvef = resolve );
    }
    function help_screen_keydown(e){
        e.preventDefault();
        if(help_screen_remove){
            help_screen_hidden = true;
        }
        if(help_screen_reset){
            refocus();
        }
        if(help_screen_keyboard){
            const f = help_screen_keyboard.handle(e, mini);
            if(f === 'close') help_screen_hidden = true;
            else if(f)        help_screen_resolvef(f());
        }
        else{
            const userf = fmap2(false, help_screen_delegate, e, help_screen_map);
            // console.log(userf)
            if(userf){
                // dispatch('userf', { userf: userf, e: e } )
                if(userf === 'close') help_screen_hidden = true;
                if(userf === 'none'){
                    help_screen_hidden = true;
                    dispatch('none');
                }
            }
        }
    }
    let help_screen_mini_css = "shadow-xl bg-white border-2 rounded fixed right-24 top-48 opacity-100 z-10";

    let input_screen_invisible = true;
    let input_screen_title = 'TITLE';
    let input_screen_input;
    let input_screen_keyboard;
    let input_screen_resolvef;
    function input_screen_open(h){
        input_screen_invisible = false;
        input_screen_title = h.title;
        input_screen_keyboard = h.keyboard;
        // remove = h.remove;
        setTimeout(function(){
            // document.getElementById('set_new_speaker_input').focus()
            input_screen_input.focus()
        }, 100);
        return new Promise( (resolve, reject) => input_screen_resolvef = resolve );
    }
    function input_screen_close(){
        input_screen_invisible = true;
        // document.getElementById('set_new_speaker_input').value = '';
        input_screen_value = '';
    }
    function input_screen_keydown(e){
        const f = input_screen_keyboard.handle(e, true);
        if(f) f();
    }

    let input_screen_value = '';
    function input_screen_open_helper(h){
      const kb = h.keyboard;
      kb.map = { Enter: 'setf', Escape: 'escape' };
      kb.delegate.setf = function() {
        // id =  $('.crnt .Speaker').data().meta.id
        const v = input_screen_value;
        document.querySelector('.keyboard').focus();
        input_screen_close();
        input_screen_resolvef(v);
      };
      kb.delegate.escape = function() {
        // id =  $('.crnt .Speaker').data().meta.id
        kb.reset();
        input_screen_close();
        input_screen_resolvef(null);
      };
      return input_screen_open(h);
    }

</script>

<style>
    .activech {
        box-shadow: inset 0 0 5px green;
    }
    .time-text {
        font: 8px sans-serif;
        text-anchor: left;
        user-select: none;
    }
    .selection-handle {
        cursor: col-resize;
        z-index: 11;
    }
    .keyboard:focus {
        color: green;
        box-shadow: inset 0 0 5px green;
        outline: none;
        background-color: white;
    }

    pre {
        width: 800px;
        overflow: auto;
    }

    .rtl {
        direction: rtl;
    }
    
    .ch1 {
        background-color: Azure;
    }
    
    .ch2 {
        background-color: Lavender;
    }

    .playing-transcript-line {
        background-color: LightGreen;
    }

    input {
        border-width: 0px;
        border: none;
    }

</style>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog bind:this={dialog_command} on:click={(e) => e.target.tagName == 'DIALOG' && dialog_command.close()} on:keypress={() => null} class="sm:max-w-4xl p-1 rounded-lg shadow-xl">
    <div>Enter Command</div>
    <input
        id="input-command"
        class="focus:ring-indigo-500 focus:border-indigo-500 flex-1 block w-full rounded-md border-gray-300"
        type=text
        bind:value={command_line}
        aria-describedby="input-command-validation"
        on:keyup={ (e) => { if(e.key === 'Enter' || e.keyCode === 13) command_line_enter = true } }
    />
    <div class="flex mt-3">
        <button class="{btn1} mr-3" on:click={() => dialog_command.close()}>Cancel</button>
    </div>
</dialog>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog bind:this={dialog_main} on:click={(e) => e.target.tagName == 'DIALOG' && dialog_main.close()} on:keypress={() => null} class="sm:max-w-4xl p-1 rounded-lg shadow-xl">
    <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div use:focus tabindex=0 on:keydown={dialog_main_keydown} class="p-4">
        <div class="mb-4 ">
            <p>
                When numbered lists appear, pressing the given number makes the given choice.
                Pressing a key that does not correspond to a valid choice will return to the
                waveform, as well as indicate "unknown choice" in the upper right corner.
            </p>
        </div>
        <div>
            <div class="flex justify-around">
                {#each dialog_main_a as x, i}
                    <div>{i+1}. {x}</div>
                {/each}
            </div>
        </div>
    </div>
</dialog>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog bind:this={dialog_waveform} on:click={(e) => e.target.tagName == 'DIALOG' && dialog_waveform.close()} on:keypress={() => null} class="sm:max-w-4xl p-1 rounded-lg shadow-xl">
<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div use:focus tabindex=0 on:keydown={dialog_waveform_keydown} class="p-4 h-96 overflow-auto">
    <div>Hit <b>h</b> to return to the main menu.</div>
    <div>
        <div class="text-xl my-4">Overview</div>
        <p>
The mouse moves the <b>cursor</b>, a vertical red line, on the waveform.
Dragging the mouse on the waveform sets the <b>selection</b>, shown as a red
rectangle on the waveform.  There is also a red rectangle below the waveform,
the <b>scrollbar</b>.  The scrollbar area represents the full length of the 
audio file, with the size and position of the scrollbar representing the portion
of the audio displayed in the waveform.  Clicking on this area will navigate
within the audio file. The <b>active
segment</b> is the segment associated with the text input and the waveform
selection.  The text of the segment becomes red when active.  Clicking on an
underline under the waveform activates and plays that segment.  Clicking on
a line in the transcript activates a text box for typing.
        </p>
    </div>
    <div>
        <div class="text-xl my-4">Keystrokes</div>
        <p>
The <b>cursor</b> and <b>selection</b> can also
be controlled with the keyboard.  In fact, all functions that can be performed with the mouse can also be performed with the keyboard.  The eight <b>home keys</b> <i>asdf jkl;</i> can be used for various moving operations.
The left hand keys move backwards, and the right hand keys move forwards, with
the inner keys being smaller increments of movement, and the outer keys being
larger increments.  In a browser window, the <b>focused element</b> is the element that receives keystrokes.
For example, <i>for typed characters to appear in a text box, that text box must have
focus</i>.  Since focusing the waveform itself would be problematic, the keyboard icon 
<i class="fa fa-keyboard"/> in the upper right of the display is used as a proxy.  When the keyboard icon is focused, the icon will be green, and green will surround the waveform.  Most keyboard operations require this kind of focus.  Clicking on the waveform will return focus to the keyboard icon, as will clicking on the icon itself, since clicking on the waveform is sometimes undesirable because it removes the selection.
        </p>
    </div>
    <div>
        <div class="text-xl my-4">Waveform Modes</div>
        <ol>
The <b>mode</b> is indicated next to the keyboard icon in the upper right of the display.
<ol>
<li>
- <b>cursor mode</b> The home keys move the cursor; the tools starts in this mode.
</li>
<li>
- <b>window mode</b> The home keys will move the visible window of the waveform.
</li>
<li>
- <b>beg mode</b> / <b>end mode</b> The home keys will move the begin / end of a selection, if there is one; same as dragging a selection boundary.
</li>
        </ol>
    </div>
    <div>
        <div class="text-xl my-4">Other Operations</div>
        <div class="other">
    <ol>
<li>
- <b>tab</b> puts focus on the text input box
</li>
<li>
- <b>space</b> play/stop.  plays selection if there is one.
</li>
<li>
- <b>c/w/b/e</b> change mode to cursor/window/beg/end
</li>
<li>
- <b>i/o</b> zoom in/out
</li>
<li>
- <b>z</b> alternately zoom in and out
</li>
<li>
- <b>enter</b> create segment from selection
</li>
<li>
- <b>forward slash</b> create segment from last segment to play head
</li>
<li>
- <b>m</b> merge active segment with the following segment
</li>
<li>
- <b>,</b> split active segment at the cursor
</li>
<li>
- <b>p</b> playback menu
</li>
    </ol>

        </div>
    </div>
</div>
</dialog>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog bind:this={dialog_input} on:click={(e) => e.target.tagName == 'DIALOG' && dialog_input.close()} on:keypress={() => null} class="sm:max-w-4xl p-1 rounded-lg shadow-xl">
<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div use:focus tabindex=0 on:keydown={dialog_input_keydown} class="p-4 h-96 overflow-auto">
<div>Hit <b>h</b> to return to the main menu.</div>
<div>When the text input box is focused, the following bindings work.</div>

<ol>
<li>
- <b>enter</b> jump to next line and play
</li>
<li>
- <b>control-space</b> play current span
</li>
<li>
- <b>control-d</b> delete current line
</li>
<li>
- <b>control-m</b> merge active segment with the following segment
</li>
<li>
- <b>control-,</b> split active segment at the cursor
</li>
</ol>
</div>
</dialog>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog bind:this={dialog_playback} on:click={(e) => e.target.tagName == 'DIALOG' && dialog_playback.close()} on:keypress={() => null} class="sm:max-w-4xl p-1 rounded-lg shadow-xl">
    <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div use:focus tabindex=0 on:keydown={dialog_playback_keydown} class="p-4 h-96 overflow-auto">
        <div>Hit <b>h</b> to return to the main menu.</div>
        <ol>
            <li>
                - <b>s</b> stop
            </li>
            <li>
                - <b>c</b> play from cursor
            </li>
            <li>
                - <b>[</b> play from beginning of selection
            </li>
            <li>
                - <b>]</b> play from end of selection
            </li>
        </ol>
    </div>
</dialog>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog bind:this={dialog_services} on:click={(e) => e.target.tagName == 'DIALOG' && dialog_services.close()} on:keypress={() => null} class="sm:max-w-4xl p-1 rounded-lg shadow-xl">
    <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div use:focus tabindex=0 on:keydown={dialog_services_keydown} class="p-4 h-96 overflow-auto">
        <div>Hit <b>h</b> to return to the main menu.</div>
        <ol>
            <li>
                1. SAD
            </li>
            <li>
                2. ASR
            </li>
        </ol>
    </div>
</dialog>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog bind:this={dialog_sad} on:click={(e) => e.target.tagName == 'DIALOG' && dialog_sad.close()} on:keypress={() => null} class="sm:max-w-4xl p-1 rounded-lg shadow-xl">
    <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div use:focus tabindex=0 on:keydown={() => null} class="p-4 h-96 overflow-auto">
        <div class="w-full mx-auto">
            {#await add_sad_p}
                <Spinner />
                prep sad...
            {:then v}
                <!-- adding {v.length} segments -->
                using {v}
            {:catch e}
                <div>error</div>
                <div>{e}</div>
            {/await}
            <hr>
            {#await add_sad_p2}
                <Spinner />
                running sad...
            {:then v}
                {#if v}
                    <div> adding {v.ch1.length} segments from channel 1</div>
                    {#if v.ch2.length}
                        <div> adding {v.ch2.length} segments from channel 2</div>
                    {/if}
                {/if}
            {:catch e}
                <div>error</div>
                <div>{e}</div>
            {/await}
            <hr>
            {#await add_sad_p3}
                <Spinner />
                creating segments...
            {:then v}
                <Spinner />
                <div>{v}</div>
            {:catch e}
                <div>error</div>
                <div>{e}</div>
            {/await}
        </div>
    </div>
</dialog>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog bind:this={dialog_asr} on:click={(e) => e.target.tagName == 'DIALOG' && dialog_asr.close()} on:keypress={() => null} class="sm:max-w-4xl p-1 rounded-lg shadow-xl">
    <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div use:focus tabindex=0 on:keydown={() => null} class="p-4 h-96 overflow-auto">
        <div class="w-full mx-auto">
            {#await add_sad_p2}
                <Spinner />
                {add_sad_p2_message}
            {:then v}
                {#if v}
                    <div> adding {v.ch1.length} segments from channel 1</div>
                    {#if v.ch2 && v.ch2.length}
                        <div> adding {v.ch2.length} segments from channel 2</div>
                    {/if}
                {/if}
            {:catch e}
                <div>error</div>
                <div>{e}</div>
            {/await}
            <hr>
            {#await add_sad_p3}
                <Spinner />
                creating segments...
            {:then v}
                <Spinner />
                <div>{v}</div>
            {:catch e}
                <div>error</div>
                <div>{e}</div>
            {/await}
        </div>
    </div>
</dialog>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog bind:this={dialog_upload_transcript} on:click={(e) => e.target.tagName == 'DIALOG' && dialog_upload_transcript.close()} on:keypress={() => null} class="sm:max-w-4xl p-1 rounded-lg shadow-xl">
    <!-- <ModalHeader title="Upload Transcript" /> -->
    {#if autoloading}
        Loading Transcript
        <Spinner />
    {/if}
    <!-- create_transcript_autox == true -->
    <div class="overflow-auto">
        <div class="Box-body overflow-auto p-4">
            {#if data_set_id && data_set_file_name}
                <div><span>Adding transcript</span><span class="mx-auto w-8 h-8"><Spinner /></span></div>
            {:else}
                {#if !create_transcript_auto}
                    <input type="file" bind:files={create_transcript_files}>
                {/if}
                <div>
                {#if (create_transcript_files && create_transcript_files[0]) || create_transcript_auto}
                    {#if create_transcript_json}
                        <button class="{btn}" on:click={create_transcript_add} data-close-dialog>Add Read Only</button>
                        {#if window.ldc.permissions.admin || create_transcript_auto}
                            <button class="{btn}" on:click={create_transcript_add_save} data-close-dialog>Add and Save</button>
                        {/if}
                    {:else if create_transcript_text}
                        {#if create_transcript_tsv}
                            file appears to be TSV
                            <button class="{btn}" on:click={() => create_transcript_json = parse_tsv(create_transcript_text)}>parse as TSV</button>
                        {:else if create_transcript_tdf}
                            file appears to be TDF
                            <button class="{btn}" on:click={() => create_transcript_json = parse_tdf(create_transcript_text)}>parse as TDF</button>
                        {:else if create_transcript_sad_with_aws}
                            file appears to be JSON
                            <button class="{btn}" on:click={() => create_transcript_json = parse_sad_with_aws(create_transcript_text)}>parse as JSON</button>
                        {:else if create_transcript_jsonn}
                            file appears to be JSON
                            <button class="{btn}" on:click={() => create_transcript_json = JSON.parse(create_transcript_text)}>parse as JSON</button>
                        {:else}
                            unknown format
                        {/if}
                    {:else}
                        <button class="{btn}" on:click={create_transcript_upload}>upload</button>
                    {/if}
                {/if}
                </div>
            {/if}
            {#if create_transcript_json}
                <pre class="h-48">
                    {#each create_transcript_json as x}
                        {JSON.stringify(x) + "\n"}
                    {/each}
                </pre>
            {:else if create_transcript_text}
                {#if create_transcript_tsv}
                    <h5>Original, first 10 lines</h5>
                    <pre>{create_transcript_text.split("\n").slice(0,9).join("\n")}</pre>
                {:else if create_transcript_tdf}
                    <h5>Original, first 10 lines</h5>
                    <pre>{create_transcript_text.split("\n").slice(0,9).join("\n")}</pre>
                {:else if create_transcript_jsonn}
                    <h5>Original, first 1000 characters</h5>
                    <pre>{create_transcript_text.substr(0,999)}</pre>
                {:else if create_transcript_sad_with_aws}
                    <h5>Original, first 1000 characters</h5>
                    <pre>{JSON.stringify(create_transcript_text).substr(0,999)}</pre>
                {/if}
            {/if}
        </div>
    </div>
</dialog>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog bind:this={dialog_download_transcript} on:click={(e) => e.target.tagName == 'DIALOG' && dialog_download_transcript.close()} on:keypress={() => null} class="sm:max-w-4xl p-1 rounded-lg shadow-xl">
    <!-- <ModalHeader title="Download Transcript" /> -->
    <div class="overflow-auto">
        <div class="Box-body overflow-auto p-4">
            <div>
                <div class="form-group">
                    <div class="form-group-header">Filename (.tsv will be appended)</div>
                    <div class="form-group-body">
                        <input
                            class="focus:ring-indigo-500 focus:border-indigo-500 flex-1 block w-full rounded-md border-gray-300"
                            type=text
                            bind:value={download_transcript_filename}
                        />
                    </div>
                </div>
                <div class="form-group">
                    <div class="form-group-header">
                        <label>
                            <input
                                class="focus:ring-indigo-500 focus:border-indigo-500 h-4 w-4 border-gray-300"
                                type=checkbox
                                bind:checked={download_transcript_include_headers}
                            />
                            Include Headers
                        </label>
                    </div>
                </div>
                <div class="form-group">
                    <div class="form-group-header">
                        <label>
                            <input
                                class="focus:ring-indigo-500 focus:border-indigo-500 h-4 w-4 border-gray-300"
                                type=checkbox
                                bind:checked={download_transcript_include_speaker}
                            />
                            Include Speaker
                        </label>
                    </div>
                </div>
                <div class="form-group">
                    <div class="form-group-header">
                        <label>
                            <input
                                class="focus:ring-indigo-500 focus:border-indigo-500 h-4 w-4 border-gray-300"
                                type=checkbox
                                bind:checked={download_transcript_include_section}
                            />
                            Include Section
                        </label>
                    </div>
                </div>
            </div>
            <!-- {#if json}
                <button class="{btn}" on:click={add} data-close-dialog>add</button>
            {:else if text}
                <button class="{btn}" on:click={download}>download</button>
            {/if} -->
            <div><button class="{btn}" on:click={download_transcript_create}>Create</button> a transcript file, which you can preview below
            {#if download_transcript_url}
                <!-- svelte-ignore a11y-missing-attribute -->
                and then <a class="text-blue-500" bind:this={download_transcript_link} download={download_transcript_filename}>Download</a>
            {/if}
            {#if download_transcript_json}
                {#each download_transcript_json as x}
                    {JSON.stringify(x) + "\n"}
                {/each}
            {:else if download_transcript_text}
                <h4>Preview</h4>
                <pre>{download_transcript_text}</pre>
            {/if}
        </div>
    </div>
</dialog>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog bind:this={dialog_close_kit} on:click={(e) => e.target.tagName == 'DIALOG' && dialog_close_kit.close()} on:keypress={() => null} class="sm:max-w-4xl p-1 rounded-lg shadow-xl">
    <!-- <ModalHeader title="Close Transcript, Move to Next File" /> -->
    <div class="overflow-auto p-4">
        <div>Close Transcript, Move to Next File</div>
        <div class="overflow-auto">
            <button class="{cbtn} w-full mb-2" on:click={dialog_close_kit_donef} use:event.dispatch={'drew_done'}>Done</button>
            <textarea
                class="mb-2 focus:ring-indigo-500 focus:border-indigo-500 flex-1 block w-full rounded-md border-gray-300"
                bind:value={done_comment}
                placeholder="comment (optional)"
            />
            <hr class="mb-2">
            <div>Was there a problem with this file?</div>
            <div class="m-2">
                <div class="form-group">
                    <div class="form-group-header">
                        <label>
                            <input
                                class="focus:ring-indigo-500 focus:border-indigo-500 h-4 w-4 border-gray-300"
                                type=radio
                                bind:group={dialog_close_kit_audit}
                                value=skip
                            />
                            Skip
                        </label>
                    </div>
                </div>
                <div class="form-group">
                    <div class="form-group-header">
                        <label>
                            <input
                                class="focus:ring-indigo-500 focus:border-indigo-500 h-4 w-4 border-gray-300"
                                type=radio
                                bind:group={dialog_close_kit_audit}
                                value=broken
                            />
                            Broken
                        </label>
                    </div>
                </div>
            </div>
            {#if dialog_close_kit_audit == 'broken' }
                <textarea
                class="mb-2 focus:ring-indigo-500 focus:border-indigo-500 flex-1 block w-full rounded-md border-gray-300"
                bind:value={broken_comment}
                placeholder="comment (optional)"
                />
            {/if}
            {#if dialog_close_kit_audit == 'skip'}
                <div><button class="{dbtn} w-full" data-close-dialog on:click={skip}>Confirm Skip</button></div>
            {/if}
            {#if dialog_close_kit_audit == 'broken'}
                <div><button class="{dbtn} w-full" data-close-dialog on:click={dialog_close_kit_brokenf}>Confirm Broken</button></div>
            {/if}
        </div>
    </div>
</dialog>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog bind:this={dialog_delete_all} on:click={(e) => e.target.tagName == 'DIALOG' && dialog_delete_all.close()} on:keypress={() => null} class="sm:max-w-4xl rounded-lg shadow-xl">
    <!-- <ModalHeader title="Close Transcript, Move to Next File" /> -->
    <div class="p-4">
        <div>Delete ALL Segments</div>
        <div>
            This will remove ALL segments, are you sure you want to do this?
        </div>
    </div>
    <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
        <div class="ml-4"><button type="button" on:click={delete_all} class={dbtn}>DELETE</button></div>
        <div class="ml-4"><button type="button" on:click={ () => dialog_delete_all.close() } class={btn}>Cancel</button></div>
    </div>
</dialog>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog bind:this={dialog_delete_all2} on:click={(e) => e.target.tagName == 'DIALOG' && dialog_delete_all2.close()} on:keypress={() => null} class="sm:max-w-4xl rounded-lg shadow-xl">
    <!-- <ModalHeader title="Close Transcript, Move to Next File" /> -->
    <div class="p-4">
        <div>Delete ALL lines with stereo docid</div>
        <div>
            There seem to be stereo docids in this transcript.  Do you want to delete them all?
        </div>
    </div>
    <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
        <div class="ml-4"><button type="button" on:click={delete_all2_wrapper} class={dbtn}>DELETE</button></div>
        <div class="ml-4"><button type="button" on:click={ () => dialog_delete_all2.close() } class={btn}>Cancel</button></div>
    </div>
</dialog>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog bind:this={dialog_settings} on:click={(e) => e.target.tagName == 'DIALOG' && dialog_settings.close()} on:keypress={() => null} class="sm:max-w-4xl rounded-lg shadow-xl">
    <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div use:focus class="grid grid-cols-2 gap-4 p-4" tabindex="0" on:keydown={dialog_settings_keydown} >
        {#each dialog_settings_a as x}
            <div class="flex">
                <div class="w-4 font-sans font-semibold uppercase text-gray-300">{x[1]}</div>
                <div class="{dialog_settings_h[x[0]] ? 'bg-green-100': ''}">{x[0]}</div>
            </div>
        {/each}
    </div>
</dialog>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog bind:this={dialog_spectrogram} on:click={(e) => e.target.tagName == 'DIALOG' && dialog_spectrogram.close()} on:keypress={() => null} class="sm:max-w-4xl rounded-lg shadow-xl">
    <div class="shadow-xl bg-white border-2 rounded fixed right-80 top-48 opacity-100 z-10">
        <div class="grid grid-cols-2 gap-4">dialog_spectrogram
            <!-- {#each all as x}
                <div class="{focus == x ? 'bg-red-100': ''}">{x}</div>
                <div>{h[x]}</div>
            {/each} -->
        </div>
    </div>
</dialog>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog bind:this={dialog_delete_section} on:click={(e) => e.target.tagName == 'DIALOG' && dialog_delete_section.close()} on:keypress={() => null} class="sm:max-w-4xl rounded-lg shadow-xl">
    <!-- <ModalHeader title="Close Transcript, Move to Next File" /> -->
    <div class="p-4">
        <div>Delete Section</div>
        <div>
            Delete the selected section?'
        </div>
    </div>
    <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
        <div class="ml-4"><button type="button" on:click={delete_selected_section} class={dbtn}>DELETE</button></div>
        <div class="ml-4"><button type="button" on:click={ () => dialog_delete_section.close() } class={btn}>Cancel</button></div>
    </div>
</dialog>

{#if spectrogram_open}
    <!-- svelte-ignore missing-declaration -->
    <!-- <Spectrogram
        bind:this={spectrogram}
        {waveform}
    /> -->
{/if}

<div id="node-00-header" class="grid grid-cols-4">
    <div class="filename col-span-2" use:event.dispatch={'drew_filename'}>
        <div>{wave_docid}</div>
        {#if redact}
            <div>REDACT</div>
        {/if}
    </div>
    <div>
        <span>{wave_selection_offset} {wave_selection_end}</span>
        <span class="{muted ? 'text-black' : 'text-white'}">muted</span>
        <span class="pl-6">
            {#each playback_rates as x}
                <button
                    class="px-1 mx-1 rounded {x == playback_rate ? 'bg-red-200' : 'bg-gray-200'}"
                    on:click={ () => playback_rate = x }
                >
                    x{x}{x == '1.5' ? '' : '.0' }
                </button>
            {/each}
        </span>
    </div>
    <div class="col-span-1">
        <div class="grid grid-cols-12">
            {#if constraint_import_transcript_auto || permissions.project_manager}
                <div class="col-span-2">
                    <button class={btn} on:click={ () => show('upload_transcript') }>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                        </svg>
                    </button>
                </div>
            {/if}
            {#if permission_to_download}
                <div class="col-span-2">
                    <button class={btn} on:click={ () => show('download_transcript') }>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
                        </svg>
                    </button>
                </div>
            {/if}
            <div class="col-span-2 float-left" use:event.dispatch={'drew_submit'}>
                <button class={btn} on:click={ () => show('close_kit') }>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                    </svg>
                </button>
            </div>
            {#if show_asr}
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="col-span-1 float-left" on:click={asr}>
                    <i class="fa fa-font"></i>
                </div>
            {/if}
            <div class="mode text-center col-span-3 float-left" use:event.dispatch={'drew_mode'}>{mode}</div>
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="col-span-2 float-left" on:mouseleave={mouseup} >
                <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div bind:this={keyboard} on:keydown={keydown} use:event.dispatch={'drew_keyboard_icon'} class="keyboard text-center mx-auto" style="width: 30px" tabindex="0">
                    <svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="keyboard" class="svg-inline--fa fa-keyboard fa-w-18" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path fill="currentColor" d="M528 448H48c-26.51 0-48-21.49-48-48V112c0-26.51 21.49-48 48-48h480c26.51 0 48 21.49 48 48v288c0 26.51-21.49 48-48 48zM128 180v-40c0-6.627-5.373-12-12-12H76c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h40c6.627 0 12-5.373 12-12zm96 0v-40c0-6.627-5.373-12-12-12h-40c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h40c6.627 0 12-5.373 12-12zm96 0v-40c0-6.627-5.373-12-12-12h-40c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h40c6.627 0 12-5.373 12-12zm96 0v-40c0-6.627-5.373-12-12-12h-40c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h40c6.627 0 12-5.373 12-12zm96 0v-40c0-6.627-5.373-12-12-12h-40c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h40c6.627 0 12-5.373 12-12zm-336 96v-40c0-6.627-5.373-12-12-12h-40c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h40c6.627 0 12-5.373 12-12zm96 0v-40c0-6.627-5.373-12-12-12h-40c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h40c6.627 0 12-5.373 12-12zm96 0v-40c0-6.627-5.373-12-12-12h-40c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h40c6.627 0 12-5.373 12-12zm96 0v-40c0-6.627-5.373-12-12-12h-40c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h40c6.627 0 12-5.373 12-12zm-336 96v-40c0-6.627-5.373-12-12-12H76c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h40c6.627 0 12-5.373 12-12zm288 0v-40c0-6.627-5.373-12-12-12H172c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h232c6.627 0 12-5.373 12-12zm96 0v-40c0-6.627-5.373-12-12-12h-40c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h40c6.627 0 12-5.373 12-12z"></path>
                    </svg>
                </div>
            </div>
        </div>
    </div>
</div>
<!-- <div bind:this={div} id="node-00" class="ChannelA Waveform active_channel" use:watchResize={resize}> -->
<div bind:this={div} id="node-00" class="ChannelA Waveform active_channel relative" use:event.dispatch={'drew_waveform'} style="width: {width}px" >
    <div id={id} class="w-full node-waveform {active_channeln == 0 ? 'activech': ''}">
        <canvas bind:this={canvas0} class="waveform-waveform {active_channeln == 0 ? 'active': ''}" use:canvas0_mount on:mousedown={mousedown0} />
        {#if draw_underlines_flag}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="underlines0 relative" style="height: {underlines0height}px" on:mousemove={mousemove_underlines} >
                {#each underlines0a as x}
                    <div
                        class="{x.class} absolute bg-blue-700"
                        style="left: {x.x}px; top: {x.y}px; width: {x.width}px; height: {underline_height}px"
                        on:click={ () => underline(x) }
                        on:keypress={keyp}
                        use:event.dispatch={'drew_underline'}
                    />
                {/each}
            </div>
        {/if}
    </div>
    {#if two}
        <div id={id2} class="w-full node-waveform {active_channeln == 1 ? 'activech': ''}">
            <canvas bind:this={canvas1} class="waveform-waveform {active_channeln == 1 ? 'active': ''}" use:canvas1_mount on:mousedown={mousedown1} />
            {#if draw_underlines_flag}
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="underlines1 relative" style="height: {underlines1height}px" on:mousemove={mousemove_underlines} >
                    {#each underlines1a as x}
                        <div
                            class="{x.class} absolute bg-blue-700"
                            style="left: {x.x}px; top: {x.y}px; width: {x.width}px; height: {underline_height}px"
                            on:click={ () => underline(x) }
                            on:keypress={keyp}
                            use:event.dispatch={'drew_underline'}
                        />
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
        class="z-10 absolute w-full"
        style="height: {wave_canvas_height}px; top: {active_top}px; cursor: {cursor_class}"
        on:mousemove={mousemove}
        on:mousedown={mousedown}
        on:mouseup={mouseup}
        on:mouseleave={mouseup}
        on:click={()=>event.dispatch(null,'clicked_on_waveform')}
    />
    <div class="cursor bg-red-300 absolute w-1px" style="left: {cursor_x}px; top: {active_top}px; height: {wave_canvas_height}px"/>
    <div class="cursor-time time-text text-red-300 absolute" style="left: {cursor_x+10}px; top: {active_top+5}px">{text}</div>
    <div
        class="selection bg-red-500/50 absolute {redact ? "redact-opacity" : ""}"
        style="left: {selection_beg_x}px; width: {selection_end_x-selection_beg_x}px; top: {active_top}px; height: {wave_canvas_height}px"
        bind:this={selection_rect}
    />
    <div class="selection-time-beg time-text absolute" style="left: {selection_end_x}px; top: {active_top+5}px">{selection_beg_text}</div>
    <div class="selection-time-end time-text absolute" style="left: {selection_beg_x}px; top: {active_top+5}px">{selection_end_text}</div>
    {#each visible_redactions as x}
        <div
            class="bg-red-500 absolute"
            style="left: {x.redacted_selection_x}px; width: {x.redacted_selection_width}px; top: 0px; height: {redacted_selection_height}px"
        />
        <div class="time-text absolute" style="left: {x.redacted_selection_x}px; top: 5px">{x.redacted_selection_beg_text}</div>
        <div class="time-text absolute" style="left: {x.redacted_selection_x+x.redacted_selection_width}px; top: 5px">{x.redacted_selection_end_text}</div>
        <div class="absolute text-center" style="left: {x.redacted_selection_x}px; width: {x.redacted_selection_width}px; top: {redacted_selection_height/2}px">REDACTED</div>
    {/each}

    <div class="play-head bg-green-300 absolute" style="left: {playheadx}px; top: {active_top}px; height: {wave_canvas_height}px; width: 1px"/>
    <div class="play-head-time time-text text-green-300 absolute" style="left: {playheadx+10}px; top: {active_top+5}px">{playheadtext}</div>

    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="w-full waveform-ticks relative"  style="height: 20px" on:mousemove={mousemove_ticks} use:event.dispatch={'drew_ticks'}>
        {#each ticks as x}
            {#if x.time_x}
                <div class="bg-black absolute" style="left: {x.x}px; width: 1px; top: 0px; height: 10px" />
                <div class="time-text absolute" style="left: {x.time_x}px; top: {time_height+10}px">{x.text}</div>
            {:else}
                <div class="bg-black absolute" style="left: {x.x}px; width: 1px; top: 5px; height: 5px" />
            {/if}
        {/each}
    </div>

    {#if scrollbar_x || scrollbar_x == 0}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
            class="w-full waveform-scrollbar relative bg-red-100"
            style="height: 20px"
            on:mousedown={mousedown_scrollbar}
            on:mouseup={mouseup_scrollbar}
            on:mouseleave={mouseup_scrollbar}
            use:event.dispatch={'drew_scrollbar'}
        >
            <div class="bg-red-300 absolute h-full" style="left: {scrollbar_x}px; width: {scrollbar_width}px" />
        </div>
    {/if}

</div>
{#if sections_open}
    <div class="sections">
        <div class="flex justify-around m-2">
            <div><button class="{btn}" on:click={close_sections}>Close</button></div>
            <div><button class="{dbtn}">Delete Section</button></div>
        </div>
        <Table bind:this={sections_table} columns={sections_table_columns} rows={sections_table_rows} use_filter={true} key_column=list_item_id />
    </div>
{/if}

<!-- <Segments {ns} {waveform} on:userf on:click_transcript_line /> -->
<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div bind:this={help_screen_screen} class="p-2 {help_screen_mini ? help_screen_mini_css : ''}" class:hidden={help_screen_hidden} tabindex=0 on:keydown={help_screen_keydown}>
    <div>
        {#if help_screen_html}
            <!-- {#if html == 'help_screen_playback_html'}
                <HelpScreenPlaybackHtml />
            {:else} -->
                {@html help_screen_html}
            <!-- {/if} -->
        {:else}
           <div>
                {#if help_screen_title}
                    <h3 class="text-xl mb-1">{help_screen_title}</h3>
                {/if}
                <ul>
                    {#each help_screen_list as x}
                        <li class="mb-1"><span class="font-sans font-semibold uppercase text-gray-300">{x[0]}</span> {x[1]}</li>
                    {/each}
                </ul>
                <div class="text-xs">press any other key to exit</div>
            </div>
        {/if}
    </div>
</div>
<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<div class="shadow-xl bg-white border-2 rounded fixed right-24 top-48 opacity-100 z-10" class:invisible={input_screen_invisible} tabindex=0>
    <div class="p-2">
        <div class="p-1 text-sm">{input_screen_title}</div>
        <input bind:this={input_screen_input} id="set_new_speaker_input" class="pl-1" on:keydown={input_screen_keydown} bind:value={input_screen_value} >
        <div class="p-1 text-sm">or ESC to exit</div>
    </div>
</div>
    
{#if output_promise}
    {#await output_promise}
        <div class="text-center text-red-500">working...</div>
    {:then v}
        {#if v.result != "ok"}
            <!-- <div>{JSON.stringify(v)}</div> -->
            {#each v.errors as x}
                <div class="text-center text-red-500">{x}</div>
            {/each}
        {/if}
    {/await}
{/if}

{#if undef.length}
    <div class="w-96 mx-auto">
        {undef.length} undefined segments found
        <button class="{btn}" on:click={ () => delete_segments(undef) }>Delete?</button>
    </div>
{/if}

{#if experimental}
    <div class="w-96 mx-auto">
        <button class="{btn}" on:click={xasr}>ASR</button>
        {#if asro.show}
            <button class="{btn}" on:click={xasr2}>next</button>
            <button class="{btn}" on:click={xasrskip}>skip</button>
        {/if}
    </div>
{/if}

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog bind:this={dialog} on:click={(e) => e.target.tagName == 'DIALOG' && dialog.close()} on:keypress={() => null}>
    <div class="text-center">Select Text</div>
    <div>use the mouse to double click or swipe</div>
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="m-9 p-9 border" on:mouseup={select_redaction}>{redact_from}</div>
    <div><span class="mr-4">selection:</span><span class="border">{redact_text}</span></div>
    <div class="flex mt-3">
        <button class="{btn} mr-3" on:click={save_redactionf}>Save</button>
        <button class="{btn} mr-3" on:click={() => dialog.close()}>Cancel</button>
    </div>
</dialog>

<div class="h-48 mt-6 pt-1 overflow-auto {rtl ? 'rtl' : ''} font-mono v-align-middle text-gray-700" use:event.dispatch={'drew_segments'}>
    {#each segs as x, i}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
            id={x.id}
            class="
                grid grid-cols-12 gap-2
                segment
                segment-{x.iid}
                flex justify-around
                mx-auto
                text-sm
                {x.id === active ? 'text-red-500' : '' }
                {x.docid && x.docid.match(/_A.wav|.wav:A/) ? 'ch1' : ''}
                {x.docid && x.docid.match(/_B.wav|.wav:B/) ? 'ch2' : ''}
            "
            data-iid={x.iid}
            on:click={click_transcript_line}
            on:keydown={() => 1}
            use:event.dispatch={'created_segment'}
        >
            <div class="col-span-2 grid grid-cols-3 justify-items-end">
                <div class="colx-span-1">
                    <div>{display_docid(x.docid)}</div>
                </div>
                <div class="btime">
                    <div>{pad(x.beg)}</div>
                </div>
                <div class="etime">
                    <div>{pad(x.end)}</div>
                </div>
            </div>
            <div class="col-span-6 text-sm">
                {#if x.id === active}
                    <input
                        class="ann-segment pl-1 p-0 w-full text-sm focus:ring-2 focus:ring-red-500 flex-1 block rounded { t_value == "REDACTED" ? "bg-red-500" : ""}"
                        type="text"
                        bind:value={t_value}
                        readonly={t_readonly}
                        on:blur={t_blur}
                        on:keydown={ (e) => t_keydown(e, x) }
                        use:t_init={x}
                    >
                    <!-- <Entry
                        node_id={x.iid}
                        name=Transcription
                        on:change={     (e) => change_handle(e, 'change') }
                        on:changelite={ (e) => change_handle(e, 'changelite') }
                        on:userf={ (e) => suserf(e, x) }
                        readonly={x.readonly || x.text == "REDACTED"}
                        readonly_text={x.text}
                        focus={sfocus}
                        transcription={x}
                    /> -->
                    {#if deleteb}
                        <div class="flex justify-end">
                            <button class="{dbtn}" on:click={delete_active_transcript_line}>delete</button>
                        </div>
                    {/if}
                {:else}
                    <div class="pl-1 transcript">{x.text}</div>
                {/if}
            </div>
            <div class="col-span-3">
                <div class="flex justify-around">
                    <div class="speaker float-left col-6">
                        <span class=Label>{x.speaker}</span>
                    </div>
                    {#if x.section}
                        <div class="section Label
                            {x.section.end ? "" : ""}
                            height-fit
                        ">
                            {x.section.name}
                        </div>
                    {:else}
                        <div class="Label"></div>
                    {/if}
                </div>
            </div>
        </div>
        {#if x.error}
            <div class="text-center bg-red-100"> {x.error} </div>
        {/if}
    {/each}
</div>
    