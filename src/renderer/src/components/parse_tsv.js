let round_to_3_places = (num) => Math.round( num * 1000 ) / 1000;
function parse(text){
    let o = text.split("\n");
    let data = [];
    let i = 0;
    for(let x of o){
        // console.log(x);
        // if(i == 100) break;
        const y = x.split("\t");
        if(y[0].match(/^Kit/)) continue;
        if(y.length > 1){
            data.push( {
                id: `segment-${i}`,
                beg: round_to_3_places(Number(y[2])),
                end: round_to_3_places(Number(y[3])),
                text: y[4],
                speaker: y[5],
                section: y[6]
            } );
        }
        i++;
    }
    data.sort( (x, y) => x.beg - y.beg );
    return data;
}
export default parse;
