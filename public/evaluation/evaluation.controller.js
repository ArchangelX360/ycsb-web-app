angular.module('evaluationController', [])
    .directive('hcEvaluationChart', function () {
        return {
            restrict: 'E',
            template: '<div></div>',
            scope: {
                title: '@',
                initfunc: '=',
                file: '@',
                yaxistitle: '@',
                type: '@',
                charttype: '@',
                xaxistype: '@',
            },
            link: function (scope, element) {
                Highcharts.theme = {
                    colors: ["#f44336", "#2196f3", "#cddc39"],
                };
                Highcharts.setOptions(Highcharts.theme);
                Highcharts.chart(element[0], {
                    chart: {
                        width: 400,
                        height: 380,
                        type: scope.charttype,
                        events: {
                            load: function () {
                                var chart = this;
                                scope.initfunc(chart, scope.file, scope.type);
                            }
                        }
                    },
                    title: {
                        text: scope.title
                    },
                    xAxis: {
                        type: scope.xaxistype
                    },
                    yAxis: {
                        title: {
                            text: scope.yaxistitle
                        }
                    },
                    tooltip: {
                        shared: true
                    },
                    series: []
                });
            }
        };
    })
    .controller('EvaluationController', function ($scope, $rootScope, $routeParams, $mdSidenav, $location, Evaluations, ToastService) {

        /**
         * Parse an evaluation name to get pretty information to display
         *
         * @param name the evaluation filename
         */
        function parseEvaluationName(name) {
            $scope.infos = {};
            var array = name.split('-');
            array.forEach(function (e) {
                switch (e[0]) {
                    case 'I':
                        $scope.infos.iterationNumber = e.substr(1).replace(/\.json/g, '');
                        break;
                    case 'W':
                        $scope.infos.workload = e.substr(1).replace(/\.json/g, '');
                        break;
                    case 'M':
                        $scope.infos.memcachedAddress = e.substr(1).replace(/\.json/g, '');
                        if ($scope.infos.memcachedAddress.split(':')[0] !== "127.0.0.1" && $scope.infos.memcachedAddress.split(':')[0] !== "localhost")
                            $scope.infos.memcachedAddress = "Memcached: Remote (" + $scope.infos.memcachedAddress + ')';
                        else
                            $scope.infos.memcachedAddress = "Memcached: Local (" + $scope.infos.memcachedAddress + ')';
                        break;
                    case 'S':
                        $scope.infos.mongo = e.substr(1).replace(/\.json/g, '');
                        if ($scope.infos.mongo.split(':')[0] !== "127.0.0.1" && $scope.infos.mongo.split(':')[0] !== "localhost")
                            $scope.infos.mongo = "MongoDB: Remote (" + $scope.infos.mongo + ')';
                        else
                            $scope.infos.mongo = "MongoDB: Local (" + $scope.infos.mongo + ')';
                        break;
                    case 'T':
                        $scope.infos.threadNumber = e.substr(1).replace(/\.json/g, '');
                        break;
                }
            });


        }

        $scope.initDataChart = function (chart, filename, phase) {
            Evaluations.getResults(filename).then(function (response) {
                    var data = response.data.data;
                    var frontendData = [];
                    var rawData = [];

                    data.sort(function (a, b) {
                        return (a.iteration > b.iteration) ? 1 : ((b.iteration > a.iteration) ? -1 : 0);
                    });

                    data.forEach(function (resultObject) {
                        if (resultObject.type === "frontend") {
                            frontendData.push(resultObject[phase])
                        } else {
                            rawData.push(resultObject[phase])
                        }
                    });

                    chart.xAxis[0].setTitle({text: "Iteration number"}, true);

                    chart.addSeries({
                        name: 'Raw',
                        data: rawData
                    });

                    chart.addSeries({
                        name: 'Frontend',
                        data: frontendData
                    });


                },
                function (err) {
                    ToastService.showToast(err.data, "error");
                }
            );
        };

        $scope.initResultChart = function (chart, filename, resultType) {
            Evaluations.getResults(filename).then(function (response) {
                    var data = response.data.results[resultType];
                    var highchartsData = [];

                    for (var cycleType in data) {
                        if (data.hasOwnProperty(cycleType)) {
                            var value = data[cycleType];
                            if (resultType === "percents") {
                                value -= 100;
                                chart.yAxis[0].setExtremes(-100, 100, true)
                            }
                            highchartsData.push([cycleType, value])
                        }
                    }

                    chart.addSeries({
                        colorByPoint: true,
                        name: 'Evaluation results',
                        showInLegend: false,
                        data: highchartsData
                    });
                },
                function (err) {
                    ToastService.showToast(err.data, "error");
                }
            );
        };

        $scope.switchEvaluation = function () {
            $location.path('evaluations/' + $scope.evaluationName);
        };

        $scope.getEvaluations = function () {
            Evaluations.getFilenames().then(function (result) {
                $scope.evaluations = result.data;
                $scope.loading = false;
            }, function (err) {
                if (err.data.hasOwnProperty('code')) {
                    ToastService.showToast(ToastService.parseFsError(err.data), 'error');
                } else {
                    ToastService.showToast(err.data, 'error');
                }
            });
        };

        $scope.loading = true;
        $scope.getEvaluations();
        $scope.evaluationName = $routeParams.evaluationName;
        $rootScope.pageTitle = ($scope.evaluationName) ? 'Evaluation results' : 'Select an evaluation';
        $scope.currentNavItem = 'nav-' + $scope.evaluationName;
        if ($scope.evaluationName)
            parseEvaluationName($scope.evaluationName);

    })
    .directive('hcComparaisonChart', function () {
        return {
            restrict: 'E',
            template: '<div></div>',
            scope: {
                title: '@',
                initfunc: '=',
                type: '@',
                charttype: '@',
                seriestype: '@'
            },
            link: function (scope, element) {
                /*Highcharts.theme = {
                 colors: ["#70DB93",
                 "#B5A642", "#5F9F9F", "#B87333", "#2F4F2F", "#9932CD", "#871F78", "#855E42", "#545454",
                 "#8E2323", "#F5CCB0", "#238E23", "#CD7F32", "#DBDB70", "#C0C0C0", "#527F76", "#9F9F5F",
                 "#8E236B", "#2F2F4F", "#EBC79E", "#CFB53B", "#FF7F00", "#DB70DB", "#D9D9F3", "#5959AB",
                 "#8C1717", "#238E68", "#6B4226", "#8E6B23", "#007FFF", "#00FF7F", "#236B8E", "#38B0DE",
                 "#DB9370", "#ADEAEA", "#5C4033", "#4F2F4F", "#CC3299", "#99CC32"]
                 };
                 Highcharts.setOptions(Highcharts.theme);*/
                var chartObject = {
                    chart: {
                        width: 900,
                        height: 500,
                        events: {
                            load: function () {
                                var chart = this;
                                scope.initfunc(chart, scope.type, scope.charttype, scope.seriestype);
                            }
                        },
                        type: scope.charttype
                    },
                    title: {
                        text: scope.title
                    },
                    yAxis: {
                        title: {
                            text: "Efficiency (%)"
                        },
                        plotLines: [{
                            value: 0,
                            color: 'black',
                            width: 2
                        }],
                        tickInterval: 0.5
                    },
                    legend: {
                        layout: "vertical",
                        //align: 'right',
                        useHTML: true,
                    },
                    tooltip: {
                        crosshairs: true,
                        shared: true
                    },
                    series: []
                };
                Highcharts.chart(element[0], chartObject);
            }
        };
    })
    .controller('CrossEvaluationController', function ($log, $scope, $rootScope, $routeParams, $mdSidenav, $location, Evaluations, ToastService) {

        /**
         * Sort a workload filenames array by number of points with the following format:
         * <number_of_points><letter_of_workload>
         *     Example: 1000a, 10000b, etc.
         *
         * NOTE: this is a very specific function, you might want to override it
         *
         * @param a one workload filename
         * @param b another workload filename
         * @returns {number}
         */
        function sortWorkloadFilenames(a, b) {
            return parseInt(a) - parseInt(b);
        }

        /**
         * Initialize a comparaison chart
         *
         * @param chart the highcharts object
         * @param highchartsCategories the x-axis categories
         * @param highchartsData the y-axis data (ordered the same way as categories) // FIXME
         * @param chartType the chart type (boxplot or other)
         * @param seriesType the series type (line or column are the more relevant here)
         */
        function initComparaisonChart(chart, highchartsCategories, highchartsData, chartType, seriesType) {
            // TODO: refactor !
            $log.info('[CROSS] Initializing chart');
            //chart.yAxis[0].setExtremes(-100, 100, true);

            var scaleXAxis = isParamXAxis("workloads") && !$scope.forceCategoriesOnXAxis;
            var xAxisData;
            if (scaleXAxis) {
                xAxisData = highchartsCategories.map(function (workloadStr) {
                    var numberOfPoints = parseInt(workloadStr);
                    if (isNaN(numberOfPoints)) {
                        scaleXAxis = false;
                        return workloadStr;
                    } else {
                        return numberOfPoints;
                    }
                });
            }
            if (!scaleXAxis) { // CAREFUL: should not be placed before previous if block
                chart.xAxis[0].setCategories(highchartsCategories);
            }

            for (var fileId in highchartsData) {
                if (highchartsData.hasOwnProperty(fileId)) {

                    if (chartType === "boxplot") {

                        var dataBoxplot = highchartsData[fileId];
                        var dataMedian = [];
                        if (scaleXAxis) {
                            dataBoxplot = [];
                            highchartsData[fileId].forEach(function (measure, index) {
                                dataBoxplot.push([xAxisData[index]].concat(measure));
                            });
                        }
                        highchartsData[fileId].forEach(function (measure, index) {
                            if (scaleXAxis) {
                                dataMedian.push([xAxisData[index], measure[2]]);
                            } else {
                                dataMedian.push(measure[2]);
                            }
                        });


                        chart.addSeries({
                            id: fileId + "-boxplot",
                            name: fileId + "-boxplot",
                            data: dataBoxplot
                        });
                        //chart.get(fileId + "-boxplot").hide();
                        /*chart.addSeries({
                            id: fileId + "-median",
                            name: fileId + "-median",
                            type: "spline",
                            data: dataMedian
                        });
                         chart.get(fileId + "-median").hide();
                         */

                    } else {
                        var dataOther = highchartsData[fileId];
                        if (scaleXAxis) {
                            dataOther = [];
                            highchartsData[fileId].forEach(function (measure, index) {
                                dataOther.push([xAxisData[index], measure]);
                            });
                        }

                        chart.addSeries({
                            id: fileId + "-" + seriesType,
                            name: fileId + "-" + seriesType,
                            type: seriesType,
                            data: dataOther
                        });
                    }
                }
            }
            $scope.loading = false;
        }

        /**
         * Returns if the view is in chart generation mode (all parameter variables are set)
         *
         * @param params parameters object
         * @returns {boolean} true if all parameter variables are set, false otherwise
         */
        function isGenerationMode(params) {
            return (params.iterationNumber.selectedValues.length > 0) &&
                (params.mongoUri.selectedValues.length > 0) &&
                (params.memcachedUri.selectedValues.length > 0) &&
                (params.threadNumber.selectedValues.length > 0) &&
                (params.workloads.selectedValues.length > 0);
        }

        /**
         * Return if the parameter with the specified name is a fixed parameter
         * @param name the name of the parameter we want to check
         * @returns {boolean} true if the parameter with the specified name is a fixed parameter, false otherwise
         */
        function isParamXAxis(name) {
            return $scope.xAxisParameter === name;
        }

        /**
         * Initialize the controller by initializing all settings
         */
        function initController() {
            $scope.xAxisParameter = $routeParams.xAxisParameter;

            Evaluations.getInfos().then(function (response) {
                var availableParameters = response.data;

                $scope.params = {
                    iterationNumber: {
                        id: "iteration-number",
                        name: "iterationNumber",
                        filenameLetter: "I",
                        collection: availableParameters.I,
                        selectedValues: [],
                        isXAxis: function () {
                            return isParamXAxis("iterationNumber")
                        }
                    },
                    mongoUri: {
                        id: "mongo-uri",
                        name: "mongoUri",
                        filenameLetter: "S",
                        collection: availableParameters.S,
                        selectedValues: [],
                        isXAxis: function () {
                            return isParamXAxis("mongoUri")
                        }
                    },
                    memcachedUri: {
                        id: "memcached-uri",
                        name: "memcachedUri",
                        filenameLetter: "M",
                        collection: availableParameters.M,
                        selectedValues: [],
                        isXAxis: function () {
                            return isParamXAxis("memcachedUri")
                        }
                    },
                    threadNumber: {
                        id: "thread-number",
                        name: "threadNumber",
                        filenameLetter: "T",
                        collection: availableParameters.T,
                        selectedValues: [],
                        isXAxis: function () {
                            return isParamXAxis("threadNumber")
                        }
                    },
                    workloads: {
                        id: "workloads",
                        name: "workloads",
                        filenameLetter: "W",
                        collection: availableParameters.W.sort(sortWorkloadFilenames),
                        selectedValues: [],
                        isXAxis: function () {
                            return isParamXAxis("workloads")
                        }
                    }
                };

                if (Object.keys($routeParams).length >= 5) {
                    for (var parameter in $routeParams) {
                        if ($routeParams.hasOwnProperty(parameter))
                            if ($scope.params.hasOwnProperty(parameter)) {
                                $scope.params[parameter].selectedValues = [];
                                $scope.params[parameter].selectedValues = $routeParams[parameter].split(',');
                                if (parameter === "workloads") {
                                    $scope.params[parameter].selectedValues.sort(sortWorkloadFilenames)
                                }
                            }
                    }
                }

                $scope.generationMode = isGenerationMode($scope.params);
                $scope.loading = false;
            });

        }

        $scope.toggle = function (item, list) {
            var idx = list.indexOf(item);
            if (idx > -1) {
                list.splice(idx, 1);
            }
            else {
                list.push(item);
            }
        };

        $scope.exists = function (item, list) {
            return list.indexOf(item) > -1;
        };

        $scope.generateComparaison = function () {
            if (isGenerationMode($scope.params)) {
                $location.path('cross-evaluations/'
                    + $scope.xAxisParameter
                    + '/' + $scope.params.iterationNumber.selectedValues.sort()
                    + '/' + $scope.params.mongoUri.selectedValues.sort()
                    + '/' + $scope.params.memcachedUri.selectedValues.sort()
                    + '/' + $scope.params.threadNumber.selectedValues.sort()
                    + '/' + $scope.params.workloads.selectedValues.sort(sortWorkloadFilenames));
            } else {
                ToastService.showToast("Please select missing parameters", "error");
            }
        };

        $scope.initComparaisonChartRoutine = function (chart, type, chartType, seriesType) {
            $scope.loading = true;
            var xAxisParam;
            var highchartsDataMap = {};

            // Getting the non-fixed parameter
            for (var parameter in $scope.params) {
                if ($scope.params.hasOwnProperty(parameter)) {
                    if ($scope.params[parameter].isXAxis()) {
                        xAxisParam = $scope.params[parameter];
                    }
                }
            }

            var highchartsCategories = xAxisParam.selectedValues;
            var replaceFixedRegex = new RegExp("(" + xAxisParam.filenameLetter + ")(.*?)(-)", "");

            var iterations = $scope.params['iterationNumber'].selectedValues.length
                * $scope.params['mongoUri'].selectedValues.length
                * $scope.params['memcachedUri'].selectedValues.length
                * $scope.params['threadNumber'].selectedValues.length
                * $scope.params['workloads'].selectedValues.length;

            $scope.params['iterationNumber'].selectedValues.forEach(function (iterationNumber) {
                $scope.params['mongoUri'].selectedValues.forEach(function (mongoUri) {
                    $scope.params['memcachedUri'].selectedValues.forEach(function (memcachedUri) {
                        $scope.params['threadNumber'].selectedValues.forEach(function (threadNumber) {
                            $scope.params['workloads'].selectedValues.forEach(function (workloads) {

                                var filename = "I" + iterationNumber
                                    + "-W" + workloads
                                    + "-M" + memcachedUri
                                    + "-T" + threadNumber
                                    + "-S" + mongoUri
                                    + "-";

                                var idFile = filename.replace(replaceFixedRegex, "$3");
                                var currentCategory = replaceFixedRegex.exec(filename)[2];
                                filename = filename.substr(0, filename.length - 1) + ".json";
                                var index = highchartsCategories.indexOf(currentCategory);

                                Evaluations.getResults(filename).then(function (response) {
                                        if (typeof  highchartsDataMap[idFile] === "undefined")
                                            highchartsDataMap[idFile] = [];
                                        highchartsDataMap[idFile][index] = getResult(response, type, chartType);
                                        --iterations;

                                        if (iterations <= 0) {
                                            initComparaisonChart(chart, highchartsCategories, highchartsDataMap,
                                                chartType, seriesType);
                                        }
                                    },
                                    function (err) {
                                        ToastService.showToast(err.data, "error");
                                    }
                                );
                            });

                        });
                    });
                });
            });
        };

        function evaluationTypeToArray(response, type) {
            // TODO: refactor !
            var measures = response.data.data;

            var raw = measures.filter(function (measure) {
                return (measure.type === "raw");
                // BE CAREFUL: if other measurement are supported, this needs to change
            }).sort(function (a, b) {
                return a.iteration - b.iteration;
            });

            var frontend = measures.filter(function (measure) {
                return (measure.type === "frontend");
            }).sort(function (a, b) {
                return a.iteration - b.iteration;
            });

            if (raw.length !== frontend.length) {
                throw "Internal error in evaluation script, " +
                "both measurement types should have the same amount of measures."
            } else {
                var resultArray = [];
                for (var i = 0; i < raw.length; ++i) {
                    var frontendValue = frontend[i][type];
                    var rawValue = raw[i][type];
                    resultArray.push((frontendValue * 100 / rawValue) - 100);
                }
                return resultArray;
            }
        }

        function getResult(response, type, chartType) {
            // TODO: refactor !
            if (chartType === "boxplot") {
                if (type === "execution_time") {
                    throw "No boxplot for execution time chart!"
                }

                var array = evaluationTypeToArray(response, type);
                return [
                    Math.min.apply(null, array),
                    quantile(array, 0.25),
                    quantile(array, 0.5),
                    quantile(array, 0.75),
                    Math.max.apply(null, array)
                ];
            } else {
                if (type === "execution_time") {
                    return response.data.results["percents"][type];
                }

                return quantile(evaluationTypeToArray(response, type), 0.5);
            }
        }

        $scope.loading = true;
        $scope.forceCategoriesOnXAxis = false;
        $rootScope.pageTitle = "Select a parameter you want to compare";
        initController();
    });
