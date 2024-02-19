<script>
  import { onMount } from 'svelte';
  import { request_animation_frame_loop_init } from 'ldcjs/src/request_animation_frame_loop'
  import Waveform from "./waveform.svelte";
  import { sets3 } from './aws_helper';
  window.ldc = {};
  window.ldc.resources = {};
  window.ldc.resources.urls = {};
  let w;
  function userf(){}
  let source_uid = false;
  let data_set_id;
  let redact;
  const permissions = {};
  let constraint_export_transcript;
  let constraint_export_transcript_to_task_admin;
  let constraint_import_transcript_auto;
  let constraint_rtl;
  let constraint_speakers;
  let constraint_sections;
  let constraint_section_order_forced;
  let xlass_def_id;
  let kit_id;
  request_animation_frame_loop_init();
  onMount(
    () => {
      const inputElement = document.getElementById("input");
      inputElement.addEventListener("change", handleFiles, false);
      function handleFiles() {
        const fileList = this.files; /* now you can work with the file list */
        console.log(fileList)
        // source_uid = this.files[0].name;
        source_uid = window.URL.createObjectURL(this.files[0]);
        // f2(source_uid);
        setTimeout(() => w.set_times_then_draw(0, 10), 2000 );
      }
      // setTimeout(() => w.set_times_then_draw(0, 10), 2000 );
    }
  )
  let init_source_uid;
  let s3;
  function f1(x){
    // console.log(x);
    return window.api.creds()
    .then( (x) => sets3(x) )
    .then( () => source_uid = init_source_uid );
  }
  // f1();
</script>

{#if source_uid}
  <Waveform
    bind:this={w}
    on:userf={userf}
    {source_uid}
    {data_set_id}
    {redact}
    callbacks={window.ldc.vars.loop}
    {permissions}
    {constraint_export_transcript}
    {constraint_export_transcript_to_task_admin}
    {constraint_import_transcript_auto}
    {constraint_rtl}
    {constraint_speakers}
    {constraint_sections}
    {constraint_section_order_forced}
    {xlass_def_id}
    {kit_id}
  />
{:else}
  <input type="file" id="input" multiple />
{/if}
