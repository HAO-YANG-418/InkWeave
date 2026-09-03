(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var pass = style.getPropertyValue('--pass').trim();
  var fail = style.getPropertyValue('--fail').trim();

  // --- Chart: 排比堆叠趋势 ---
  var c1 = echarts.init(document.getElementById('chart-stacking'), null, { renderer: 'svg' });
  c1.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true },
    legend: { data: ['排比组数', '排比处数'], textStyle: { color: muted }, bottom: 0 },
    grid: { left: 50, right: 50, top: 30, bottom: 50 },
    xAxis: { type: 'category', data: ['R1', 'R2', 'R3', 'R4'], axisLabel: { color: muted }, axisLine: { lineStyle: { color: rule } } },
    yAxis: [
      { type: 'value', name: '组数', nameTextStyle: { color: muted }, axisLabel: { color: muted }, splitLine: { lineStyle: { color: rule } } },
      { type: 'value', name: '处数', nameTextStyle: { color: muted }, axisLabel: { color: muted }, splitLine: { show: false } }
    ],
    series: [
      { name: '排比组数', type: 'bar', data: [16, 12, 0, 0], itemStyle: { color: accent2 }, barWidth: '30%' },
      { name: '排比处数', type: 'line', yAxisIndex: 1, data: [74, 54, 0, 0], itemStyle: { color: accent }, lineStyle: { color: accent }, symbol: 'circle', symbolSize: 8 }
    ],
    color: [accent2, accent]
  });
  window.addEventListener('resize', function() { c1.resize(); });

  // --- Chart: 感官密度趋势 ---
  var c2 = echarts.init(document.getElementById('chart-sense'), null, { renderer: 'svg' });
  c2.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true },
    grid: { left: 50, right: 30, top: 30, bottom: 30 },
    xAxis: { type: 'category', data: ['R1', 'R2', 'R3', 'R4'], axisLabel: { color: muted }, axisLine: { lineStyle: { color: rule } } },
    yAxis: { type: 'value', name: '%', max: 100, nameTextStyle: { color: muted }, axisLabel: { color: muted }, splitLine: { lineStyle: { color: rule } } },
    series: [{
      type: 'line', data: [70, 63, 51, 45],
      itemStyle: { color: accent },
      lineStyle: { color: accent, width: 2 },
      areaStyle: { color: accent + '22' },
      symbol: 'circle', symbolSize: 10,
      markArea: {
        silent: true,
        data: [[{ yAxis: 45, itemStyle: { color: pass + '22', borderColor: pass, borderWidth: 1, borderType: 'dashed' } }, { yAxis: 0 }]]
      },
      markLine: {
        silent: true,
        data: [{ yAxis: 45, lineStyle: { color: pass, type: 'dashed', width: 2 }, label: { formatter: '门禁线 45%', color: pass, fontSize: 11 } }],
        symbol: 'none'
      }
    }],
    color: [accent]
  });
  window.addEventListener('resize', function() { c2.resize(); });

  // --- Chart: 字数趋势 ---
  var c3 = echarts.init(document.getElementById('chart-words'), null, { renderer: 'svg' });
  c3.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true },
    grid: { left: 50, right: 30, top: 30, bottom: 30 },
    xAxis: { type: 'category', data: ['R1', 'R2', 'R3', 'R4'], axisLabel: { color: muted }, axisLine: { lineStyle: { color: rule } } },
    yAxis: { type: 'value', name: '字', nameTextStyle: { color: muted }, axisLabel: { color: muted }, splitLine: { lineStyle: { color: rule } } },
    series: [{
      type: 'line', data: [4176, 3964, 3733, 3519],
      itemStyle: { color: accent2 },
      lineStyle: { color: accent2, width: 2 },
      areaStyle: { color: accent2 + '22' },
      symbol: 'circle', symbolSize: 10,
      markLine: {
        silent: true,
        data: [
          { yAxis: 3600, lineStyle: { color: pass, type: 'dashed', width: 2 }, label: { formatter: '上限 3600', color: pass, fontSize: 11 } },
          { yAxis: 3000, lineStyle: { color: muted, type: 'dashed', width: 1.5 }, label: { formatter: '目标 3000', color: muted, fontSize: 11 } }
        ],
        symbol: 'none'
      }
    }],
    color: [accent2]
  });
  window.addEventListener('resize', function() { c3.resize(); });

  // --- Chart: Error雷达 ---
  var c4 = echarts.init(document.getElementById('chart-radar'), null, { renderer: 'svg' });
  c4.setOption({
    animation: false,
    tooltip: { appendToBody: true },
    legend: { data: ['R1', 'R2', 'R3', 'R4'], textStyle: { color: muted }, bottom: 0 },
    radar: {
      center: ['50%', '55%'],
      radius: '65%',
      indicator: [
        { name: '排比堆叠', max: 100 },
        { name: '感官密度', max: 100 },
        { name: '字数', max: 100 },
        { name: '逗号链', max: 100 },
        { name: '数据锚点', max: 100 },
        { name: '场景碎片', max: 100 }
      ],
      axisName: { color: muted },
      splitArea: { areaStyle: { color: [bg2, bg2, bg2, bg2] } },
      splitLine: { lineStyle: { color: rule } },
      axisLine: { lineStyle: { color: rule } }
    },
    series: [{
      type: 'radar',
      data: [
        { value: [95, 70, 95, 60, 55, 65], name: 'R1', lineStyle: { color: fail }, itemStyle: { color: fail }, areaStyle: { color: fail + '22' } },
        { value: [85, 63, 90, 45, 55, 65], name: 'R2', lineStyle: { color: '#e67e22' }, itemStyle: { color: '#e67e22' }, areaStyle: { color: '#e67e2222' } },
        { value: [0, 51, 80, 0, 55, 65], name: 'R3', lineStyle: { color: '#f1c40f' }, itemStyle: { color: '#f1c40f' }, areaStyle: { color: '#f1c40f22' } },
        { value: [0, 45, 17, 0, 55, 0], name: 'R4', lineStyle: { color: pass }, itemStyle: { color: pass }, areaStyle: { color: pass + '33' } }
      ],
      symbol: 'circle', symbolSize: 5
    }],
    color: [fail, '#e67e22', '#f1c40f', pass]
  });
  window.addEventListener('resize', function() { c4.resize(); });
})();