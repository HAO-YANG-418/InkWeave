// InkWeave v4.8 效果度量对比图表
(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  // --- Chart 1: 视觉占比对比 ---
  var chart1 = echarts.init(document.getElementById('chart-visual'), null, { renderer: 'svg' });
  chart1.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true },
    legend: { data: ['旧版 (v4.5)', '新版 (v4.8)'], textStyle: { color: muted }, bottom: 0 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: ['第1章', '第8章', '第14章'], axisLabel: { color: muted }, axisLine: { lineStyle: { color: rule } } },
    yAxis: { type: 'value', name: '视觉占比 (%)', max: 100, axisLabel: { color: muted }, nameTextStyle: { color: muted }, splitLine: { lineStyle: { color: rule } }, axisLine: { lineStyle: { color: rule } } },
    series: [
      { name: '旧版 (v4.5)', type: 'bar', data: [75, 64, 83], itemStyle: { color: accent2 + '99' }, barGap: '20%' },
      { name: '新版 (v4.8)', type: 'bar', data: [55, 59, 70], itemStyle: { color: accent }, label: { show: true, position: 'top', color: accent, fontWeight: 'bold' } }
    ]
  });
  window.addEventListener('resize', function() { chart1.resize(); });

  // --- Chart 2: 评分对比 ---
  var chart2 = echarts.init(document.getElementById('chart-score'), null, { renderer: 'svg' });
  chart2.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true },
    legend: { data: ['旧版 (v4.5)', '新版 (v4.8)'], textStyle: { color: muted }, bottom: 0 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: ['第1章', '第8章', '第14章'], axisLabel: { color: muted }, axisLine: { lineStyle: { color: rule } } },
    yAxis: { type: 'value', name: '评分', max: 100, axisLabel: { color: muted }, nameTextStyle: { color: muted }, splitLine: { lineStyle: { color: rule } }, axisLine: { lineStyle: { color: rule } } },
    series: [
      { name: '旧版 (v4.5)', type: 'bar', data: [75, 73, 73], itemStyle: { color: accent2 + '99' }, barGap: '20%' },
      { name: '新版 (v4.8)', type: 'bar', data: [71, 68, 59], itemStyle: { color: accent }, label: { show: true, position: 'top', color: accent, fontWeight: 'bold' } }
    ]
  });
  window.addEventListener('resize', function() { chart2.resize(); });

  // --- Chart 3: 感官丰富度对比 ---
  var chart3 = echarts.init(document.getElementById('chart-sensory'), null, { renderer: 'svg' });
  chart3.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true },
    legend: { data: ['旧版感官总数', '新版感官总数'], textStyle: { color: muted }, bottom: 0 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: ['第1章', '第8章', '第14章'], axisLabel: { color: muted }, axisLine: { lineStyle: { color: rule } } },
    yAxis: { type: 'value', name: '感官词总数', axisLabel: { color: muted }, nameTextStyle: { color: muted }, splitLine: { lineStyle: { color: rule } }, axisLine: { lineStyle: { color: rule } } },
    series: [
      { name: '旧版感官总数', type: 'bar', data: [60, 136, 107], itemStyle: { color: accent2 + '99' }, barGap: '20%' },
      { name: '新版感官总数', type: 'bar', data: [93, 185, 151], itemStyle: { color: accent }, label: { show: true, position: 'top', color: accent, fontWeight: 'bold' } }
    ]
  });
  window.addEventListener('resize', function() { chart3.resize(); });

  // --- Chart 4: 排比堆叠对比 ---
  var chart4 = echarts.init(document.getElementById('chart-stacking'), null, { renderer: 'svg' });
  chart4.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true },
    legend: { data: ['旧版排比组数', '新版排比组数'], textStyle: { color: muted }, bottom: 0 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: ['第1章', '第8章', '第14章'], axisLabel: { color: muted }, axisLine: { lineStyle: { color: rule } } },
    yAxis: { type: 'value', name: '排比组数', axisLabel: { color: muted }, nameTextStyle: { color: muted }, splitLine: { lineStyle: { color: rule } }, axisLine: { lineStyle: { color: rule } } },
    series: [
      { name: '旧版排比组数', type: 'bar', data: [6, 8, 16], itemStyle: { color: accent2 + '99' }, barGap: '20%' },
      { name: '新版排比组数', type: 'bar', data: [6, 10, 17], itemStyle: { color: '#f85149' }, label: { show: true, position: 'top', color: '#f85149', fontWeight: 'bold' } }
    ]
  });
  window.addEventListener('resize', function() { chart4.resize(); });
})();