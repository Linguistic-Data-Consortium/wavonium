<script>
  import icons from './assets/icons.svg'
  import Versions from './components/Versions.svelte'
  // import Main from './components/main.svelte';
</script>

<div class="container">
  <Versions />
</div>
<!-- <Main /> -->

<style>
  .container {
    flex: 1;
    display: flex;
    flex-direction: column;
    /* max-width: 840px; */
    margin: 0 auto;
    /* padding: 15px 30px 0 30px; */
    background-color: #2f3241;
  }
</style>
