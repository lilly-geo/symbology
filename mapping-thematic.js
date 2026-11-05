let map = L.map('map');

map.setView([40, -96], 5);

const streets = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri'
}).addTo(map);

const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri'
});

let layer_control = L.control.layers({
    'Streets': streets,
    'Satellite': satellite
}).addTo(map);

// overlay layers

let overlay_names = {
    'counties': 'U.S. Counties',
    'states': 'U.S. States'
}

// add a couple of custom controls

let legend = L.control({position: 'bottomright'});

legend.onAdd = function (map) {
    this._div = L.DomUtil.create('div', 'legend');
    this._div.innerHTML = '<h3>First Complete Map</h3>';
    return this._div;
}

legend.update = function (props) {
    if (props) 
        this._div.innerHTML += props;
}
legend.addTo(map);

let info = L.control({position: 'bottomleft'});

info.onAdd = function (map) {
    this._div = L.DomUtil.create('div', 'info');
    this.update();
    return this._div;
}

info.update = function (props) {
    this._div.innerHTML = `<h4>Query Info</h4>
        ${ props ? props : 'Hovering on overlay maps'}`;
}

info.addTo(map);

// seriously overlay layers

/*
Improvement 1: format numbers with commas (10000000 to 10,000,000)
*/

function fmt(num) {
    if (num === undefined || num === null || isNaN(num)) return 'N/A';
    return Number(num).toLocaleString('en-US', {maximumFractionDigits: 2});
}

const url_uscnty = 'https://raw.githubusercontent.com/gisalgs/data/refs/heads/master/uscnty48area.geojson';

// assume grades is an array in ascending order [0, 5, 10, 100]
// we will use three classes
function getClass(val, grades) {
    for (let i=grades.length-2; i>=0; i--) {
        if (val >= grades[i])
            return i;
    }
    return 0; //fallback statement: take care of other values
}

function getColor(val, grades) {
    const c = getClass(val, grades);
    const colors = ['#ece7f2', '#a6bddb', '#2b8cbe'];
    return colors[c]; //assume c between 0-2
}

function getSize(val, grades) {
    const c = getClass(val, grades);
    return c == 2 ? 20 :
        c == 1 ? 14 : 9;
}

// load geojson and show map

let counties; 

/*

        N E W

*/

let current_mapping_var;
let current_grades;

function create_dropdown_list(data, id, is_numerical=true) {
    const ele1 = $(`#${id}`);
    Object.entries(data.features[0].properties).forEach(([key, value], i)=>{
        console.log(key, value, i);
        let add = true; 
        if ( (typeof value!='number' || isNaN(value)) && is_numerical)
            add = false;
        if (add) {
            ele1.append($('<option>', {
                value: key,
                text: key
            }));
        }
    });
    ele1.on('change', function(){
        current_mapping_var  = ele1.val();
        grades = get_var_grades(data, current_mapping_var);
        current_grades = grades;
        update_map_legend(grades);
        counties.setStyle(county_style);
    });
}

function county_style(feature) {
    return {
        color: "#bdbdbd",
        fillColor: getColor(feature.properties[current_mapping_var], current_grades),
        fillOpacity: 0.8,
        weight: 1
    }
}

// equal intervals
function get_var_grades(data, varname) {
    let vals = [];
    data.features.forEach((f)=>{
        vals.push(f.properties[varname]);
    });
    vals.sort(function(a, b) {
        return a-b;
    });
    let minx = vals[0];
    let maxx = vals.at(-1);
    if (minx>0 && minx<1) minx = 0;
    const diff = maxx - minx;

    let grades = [minx, minx+diff/3, minx+2*diff/3, maxx];
    return grades
}

function update_map_legend(grades) {
    let txt = make_legend_content(grades);
    console.log(txt);
    $("#counties-symbols").html(txt);
}

function make_legend_content(grades) {
    function nice_format(num) {
        return fmt(num);
    }

    let legend_txt = '';
    for (let i=0; i<grades.length-1; i++) {
        legend_txt += `<i style="background: ${getColor(grades[i], grades)}"></i>
        ${nice_format(grades[i])} to ${nice_format(grades[i+1])}<br/>`;
    }
    return legend_txt;
}

function make_layer(data) {
    return L.geoJSON(data, {
        style: county_style,
        onEachFeature: onEachCountyFeature
    })
}

$.getJSON(url_uscnty, data =>{ // data is the result and is an object
    const dropdown_id = "choose-mapping-var";
    let legend_txt = `
        <div class="legendbox" id="countyLegend">
        <h4>${overlay_names.counties}</h4>
        <p><select id=${dropdown_id}></select></p>`;
    current_mapping_var = "UrbanPop";
    current_grades = get_var_grades(data, current_mapping_var);
    legend_txt += `<div id="counties-symbols">`;
    legend_txt += make_legend_content(current_grades);
    legend_txt += `</div></div>`
    legend.update(legend_txt);

    create_dropdown_list(data, dropdown_id);
    counties = make_layer(data).addTo(map);
    layer_control.addOverlay(counties, overlay_names.counties);
})

function onEachCountyFeature(feature, layer) {
    layer.on({
        mouseover: highlightCountyFeature,
        mouseout: resetCountyHighlight
    });
    layer.on('click', e => {
        const popup = L.popup();
        popup.setLatLng(e.latlng).setContent(
            `Location: ${e.latlng.lng.toFixed(3)}&deg;, ${e.latlng.lat.toFixed(3)}&deg;<br/>
            Distance to Columbus, OH: ${
                (map.distance(e.latlng, L.latLng(40, -83))/1000)
                .toLocaleString('en-US', {maximumFractionDigits: 2})} km`
        ).openOn(map);
    })
}

function highlightCountyFeature(e) {
    let layer = e.target;
    layer.setStyle({
        weight: 5,
        color: '#999',
        fillOpacity: 0.7,
    }).bringToFront();
    let feature = layer.feature;
    let popupContent = `<h5>Layer: ${overlay_names.counties}</h5>
        County: ${feature.properties.NAME}<br/>
        State: ${feature.properties.STATE_NAME}<br/>
        Position: ${e.latlng.lng.toFixed(3)}&deg;, ${e.latlng.lat.toFixed(3)}&deg;<br/>
        Population Density: ${fmt(feature.properties.PopDensity)}<br/>`
    info.update(popupContent);
}

function resetCountyHighlight(e) {
    counties.resetStyle(e.target);
}

// layer 2

const url_usstate = 'https://raw.githubusercontent.com/gisalgs/data/refs/heads/master/usstates48_centroids.geojson';

map.createPane('alwaysOnTop');
map.getPane('alwaysOnTop').style.zIndex = 650; // default is 400 higher is more on top
map.getPane('alwaysOnTop').style.pointEvents = 'none'; //nothing intereres with order

let states;

$.getJSON(url_usstate, data=>{
    const grades = [0, 1000000, 5000000, 5000000*2];
    let legend_txt = `
        <div class="legendbox" id="statesLegend">
        <h4>${overlay_names.states}</h4>
        <h5>State Population</h5>`;
    
    for (let i=0; i<grades.length-1; i++) {
        id = `circle${i}`;
        const circleStyle = `
            background: #ff8888;
            border-color: #000;
            width: ${2*getSize(grades[i], grades)}px;
            height: ${2*getSize(grades[i], grades)}px;`;
        
        const circle = `
            <div class="circlebox" style="line-height: ${(2*getSize(grades[i], grades)+2)}px">
            <i id="${id}" style="${circleStyle}"></i>
            ${fmt(grades[i])} to ${fmt(grades[i + 1])}</div>`;
        legend_txt += circle;
    }
    
    legend_txt += '</div>';
    legend.update(legend_txt);

    states = L.geoJSON(data, {
        pointToLayer: function(feature, latlng) {
            return L.circleMarker(latlng, {
                pane: 'alwaysOnTop',
                fillColor: '#ff8888',
                color: '#000',
                radius: getSize(feature.properties.Tot_pop, grades),
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            })
        },
        onEachFeature: onEachStateFeature
    }).addTo(map);
    layer_control.addOverlay(states, overlay_names.states);
})

function onEachStateFeature(feature, layer) {
    layer.on({
        mouseover: highlightStateFeature,
        mouseout: resetStateHighlight 
    })
}

function highlightStateFeature(e) {
    let layer = e.target;
    layer.setStyle({
        weight: 5,
        color: '#999',
        fillOpacity: 0.7
    }).bringToFront();
    let feature = layer.feature;
    let popupContent = `
        <h5>Layer: ${overlay_names.states}</h5>
        State: ${feature.properties.postal}<br/>
        Population: ${fmt(feature.properties.Tot_pop)}<br/>`
    info.update(popupContent);
}

function resetStateHighlight(e) {
    states.resetStyle(e.target);
}

// update legend

map.on('overlayadd', function(e) {
    switch(e.name) {
        case overlay_names['counties']:
            $("#countyLegend").css('display', 'block');
            break;
        case overlay_names['states']:
            $("#statesLegend").css('display', 'block');
            break;
    }
})

map.on('overlayremove', function(e) {
    switch(e.name) {
        case overlay_names['counties']:
            $("#countyLegend").css('display', 'none');
            break;
        case overlay_names['states']:
            $("#statesLegend").css('display', 'none');
            break;
    }
})
