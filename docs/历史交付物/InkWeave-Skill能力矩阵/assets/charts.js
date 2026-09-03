(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  // --- Chart 1: Score Distribution ---
  var chart1 = echarts.init(document.getElementById('chart-score-dist'), null, { renderer: 'svg' });
  chart1.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '8%', containLabel: true },
    xAxis: {
      type: 'category',
      data: ['第1章','第2章','第3章','第4章','第5章','第6章','第7章','第8章','第9章','第10章','第11章','第12章','第13章','第14章','第15章'],
      axisLabel: { color: muted, fontSize: 11 },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: {
      type: 'value', min: 70, max: 100,
      axisLabel: { color: muted, fontSize: 11 },
      axisLine: { lineStyle: { color: rule } },
      splitLine: { lineStyle: { color: rule } }
    },
    series: [{
      type: 'bar',
      data: [97, 96, 95, 93, 98, 98, 96, 94, 92, 91, 90, 73, 89, 93, 99],
      itemStyle: {
        color: function(params) {
          var v = params.value;
          if (v >= 90) return accent2;
          if (v >= 85) return accent;
          return '#d29922';
        }
      },
      markLine: {
        silent: true,
        data: [{ yAxis: 85, label: { formatter: 'A级线 85', color: muted, fontSize: 11 }, lineStyle: { color: accent, type: 'dashed' } }]
      }
    }]
  });
  window.addEventListener('resize', function() { chart1.resize(); });

  // --- Chart 2: Chapter Score & Word Count Trend ---
  var chart2 = echarts.init(document.getElementById('chart-chapter-trend'), null, { renderer: 'svg' });
  var chapters = ['Ch1','Ch2','Ch3','Ch4','Ch5','Ch6','Ch7','Ch8','Ch9','Ch10','Ch11','Ch12','Ch13','Ch14','Ch15'];
  var scores = [97, 96, 95, 93, 98, 98, 96, 94, 92, 91, 90, 73, 89, 93, 99];
  var words = [3012, 2987, 3050, 2945, 3100, 3005, 2990, 3018, 3025, 2980, 2846, 3005, 2833, 3010, 3015];

  chart2.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true },
    legend: {
      data: ['评分', '字数'],
      textStyle: { color: muted, fontSize: 12 },
      top: 0
    },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '12%', containLabel: true },
    xAxis: {
      type: 'category',
      data: chapters,
      axisLabel: { color: muted, fontSize: 11 },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: [
      {
        type: 'value', name: '评分', min: 60, max: 100,
        axisLabel: { color: muted, fontSize: 11 },
        axisLine: { lineStyle: { color: rule } },
        splitLine: { lineStyle: { color: rule } }
      },
      {
        type: 'value', name: '字数', min: 2500, max: 3500,
        axisLabel: { color: muted, fontSize: 11 },
        axisLine: { lineStyle: { color: rule } },
        splitLine: { show: false }
      }
    ],
    series: [{
      name: '评分',
      type: 'line',
      data: scores,
      smooth: true,
      lineStyle: { color: accent, width: 2 },
      itemStyle: { color: accent },
      markLine: {
        silent: true,
        data: [{ yAxis: 85, label: { formatter: 'A级线', color: muted, fontSize: 10 }, lineStyle: { color: accent, type: 'dashed' } }]
      }
    }, {
      name: '字数',
      type: 'bar',
      yAxisIndex: 1,
      data: words,
      itemStyle: { color: accent2 + '44' },
      barWidth: '60%'
    }]
  });
  window.addEventListener('resize', function() { chart2.resize(); });
})();