angular.module('benchmarkController', [])
// inject the Benchmark service factory into our controller
    .controller('BenchmarkController', ['$scope', '$rootScope', '$http', 'Benchmarks', '$routeParams', '$mdSidenav', '$mdDialog', '$mdToast', '$location', function ($scope, $rootScope, $http, Benchmarks, $routeParams, $mdSidenav, $mdDialog, $mdToast, $location) {

        $scope.loading = true;
        var UPDATE_INTERVAL = 200;

        /**
         * FONCTION DEFINITION BLOCK
         */

        /**
         * Convert stored raw values from YCSB to Highchart formatting
         * @param rawValues YCSB raw DB values
         * @returns {*} Highchart formatted data
         */
        function convertToSerie(rawValues) {
            return rawValues.map(function (measureObj) {
                return [measureObj.createdAt, measureObj.latency]
            });
        }

        function updateAverage(average, size, newValue) {
            return (size * average + newValue) / (size + 1);
        }

        /**
         * Create an average serie from a value and an original serie
         * @param serie the original serie of which we want an average serie
         * @returns {{name: string, data: *}} the average Highchart serie
         */
        function createAverageSerie(serie, value) {
            // FIX: possible million iterations
            return {
                name: 'Average ' + serie.name,
                data: serie.data.map(function (point) {
                    return [point[0], value];
                })
            };
        }

        /**
         * Add a point to the chart's serie
         * @param chartOption option of the chart to access the serie
         * @param point couple to add [timestamp, value]
         * @param serieIndex index of the serie
         */
        function addPoint(chartOption, point, serieIndex) {
            chartOption.series[serieIndex].data.push(point);
        }

        /**
         * Free update semaphore of a specific operationType chart
         * @param operationType the operationType string
         */
        function freeSemaphore(operationType) {
            $scope.updateSemaphore[operationType] = false;
        }

        /**
         * Update the chart points with new points in DB from the fromDateTimestamp to now
         * @param operationType the operationType string
         * @param fromDateTimestamp the timestamp of the date from which we should update points
         * @param callback a callback function
         */
        function updateChart(operationType, fromDateTimestamp, callback) {
            $scope.updateSemaphore[operationType] = true;
            Benchmarks.getByNameByOperationTypeFrom($scope.benchmarkName, operationType, fromDateTimestamp)
                .success(function (records) {
                    if (records.length > 0) {
                        var chartConfigVariableName = operationType.toLowerCase() + 'ChartConfig';
                        var average = $scope.highchartConfigs[chartConfigVariableName].series[1].data[0][1];

                        var originalSerie = $scope.highchartConfigs[chartConfigVariableName].series[0];
                        var originalSerieLength = originalSerie.data.length;

                        records.forEach(function (point) {
                            // FIXME: potentially on million iterations !
                            average = updateAverage(average, originalSerieLength, point.latency);
                            addPoint($scope.highchartConfigs[chartConfigVariableName],
                                [point.createdAt, point.latency], 0);
                        });

                        // updating average serie
                        $scope.highchartConfigs[chartConfigVariableName].series[1] =
                            createAverageSerie(originalSerie, average);
                        // updating timestamps
                        $scope.operationTypeToLastValueDisplayed[operationType] = records[records.length - 1];
                        console.log(operationType + " chart updated !");
                    }
                })
                .then(function () {
                    if (callback)
                        callback(operationType);
                });
        }

        /**
         * Updates all charts or initialize not initialized charts and update the benchmarks list
         */
        function updateChartView() {
            getBenchmarkList();
            $scope.operationArray.forEach(function (operationType) {
                var lastValueDisplayed = $scope.operationTypeToLastValueDisplayed[operationType];
                if (!$scope.updateSemaphore[operationType])
                    !lastValueDisplayed.hasOwnProperty("createdAt") ? initChart(operationType, freeSemaphore)
                        : updateChart(operationType, lastValueDisplayed.createdAt, freeSemaphore);
            });
        }

        /**
         * Activate the chart view and initialize values for an operationType
         * @param operationType string of the operationType processed
         * @param series Highchart data series for the operationType chart
         */
        function displayChart(operationType, series) {
            var chartConfigVariableName = operationType.toLowerCase() + 'ChartConfig';
            // Defining the chart title will activate its visualisation on the view
            $scope.highchartConfigs[chartConfigVariableName].title.text = operationType + " operations";

            // Adding series to the specific operation chart and to the all operations chart
            $scope.highchartConfigs[chartConfigVariableName].series = [];
            series.forEach(function (serie) {
                //$scope.highchartConfigs.allChartConfig.series.push(serie);
                $scope.highchartConfigs[chartConfigVariableName].series.push(serie);
            })

        }

        /**
         * Initialize chart of an specified operationType creating its series and displaying it
         * If there is no data for the specified operationType, its graph is not initialized.
         * @param operationType the operationType string
         * @param callback a callback function
         */
        function initChart(operationType, callback) {
            $scope.updateSemaphore[operationType] = true;
            // We fetch YCSB results
            Benchmarks.getByNameByOperationType($scope.benchmarkName, operationType)
                .success(function (data) {
                    // TODO : better error handling
                    if (data.hasOwnProperty('results')) {
                        var result = data["results"];
                        if (Array.isArray(result) && result.length > 0) {
                            // if there is at least one result for this operation in YCSB
                            // and it's not an error
                            // We create our HighChart serie
                            var pixelWidth = result.length >= 10000 ? result.length / 1000 : 10;
                            // TODO : infere this better
                            var serie = {
                                name: operationType + " latency",
                                data: convertToSerie(result),
                                dataGrouping: {
                                    groupPixelWidth: pixelWidth
                                }
                            };

                            // We create the HighChart average serie of the operationType
                            var total = serie.data.reduce(function (previous, current) {
                                return previous + current[1];
                            }, 0);
                            var average = total / serie.data.length;
                            var averageSerie = createAverageSerie(serie, average);

                            // We save the last operation timestamp for future updates
                            $scope.operationTypeToLastValueDisplayed[operationType] = result[result.length - 1];
                            // We display result in the corresponding chart
                            displayChart(operationType, [serie, averageSerie]);
                            console.log(operationType + " chart init !");
                        } else if (!Array.isArray(result) && result.length > 0) {
                            // FIXME : not working anymore !
                            // If it's a string, then it's an error
                            throw result;
                        }
                    }
                })
                .then(function () {
                    $scope.loading = false;
                    if (callback)
                        callback(operationType);
                });
        }

        /**
         * Initialize all operationType charts
         */
        function initCharts() {
            $scope.loading = true;
            $scope.operationArray.forEach(function (operationType) {
                initChart(operationType, freeSemaphore)
            });
        }

        /**
         * Launch the charts updating process
         */
        function launchChartUpdating() {
            $scope.updateChartInterval = setInterval(updateChartView, UPDATE_INTERVAL);
        }

        /**
         * Initialize all variables of an operationType including maps' keys, chart options and update semaphore.
         * @param operationType the operationType string
         */
        function initVariables(operationType) {
            $scope.operationTypeToLastValueDisplayed[operationType] = {};
            $scope.updateSemaphore[operationType] = false;
            $scope.highchartConfigs[operationType.toLowerCase() + 'ChartConfig'] = {
                options: {
                    chart: {
                        zoomType: 'x',
                        height: 650
                    },
                    tooltip: {
                        formatter: function () {
                            var s = 'Timestamp: <b>' + this.x / 1000000 + '</b>';

                            this.points.forEach(function (point) {
                                s += '<br/><span style="color:'
                                    + point.series.color + '">\u25CF</span> '
                                    + point.series.name + ': <b>' + point.y + '</b>';
                            });
                            return s;

                        }
                    },
                    exporting: {
                        csv: {
                            dateFormat: '%Y-%m-%dT%H:%M:%S.%L'
                        }
                    },
                    rangeSelector: {
                        enabled: true,
                        allButtonsEnabled: true,
                        buttons: [{
                            type: 'millisecond',
                            count: 50000000,
                            text: '50ms'
                        }, {
                            type: 'millisecond',
                            count: 100000000,
                            text: '100ms'
                        }, {
                            type: 'millisecond',
                            count: 300000000,
                            text: '300ms'
                        }, {
                            type: 'millisecond',
                            count: 800000000,
                            text: '800ms'
                        }, {
                            type: 'all',
                            text: 'All'
                        }],
                        buttonTheme: {
                            width: 50
                        },
                        selected: 5
                    },
                    navigator: {
                        enabled: true,
                        series: {
                            includeInCSVExport: false
                        }
                    }
                },
                xAxis: {
                    labels: {
                        formatter: function () {
                            return (this.value / 1000000);
                        }
                    }
                },
                // Stores the chart object into a scope variable to use Highcharts functionnalities
                // not implemented by highchart-ng
                func: function (chart) {
                    $scope.highchartCharts[operationType.toLowerCase() + 'Chart'] = chart;
                },
                series: [],
                title: {
                    text: 'default config'
                },
                useHighStocks: true
            };
        }

        /**
         * Get all benchmarks names and stores it into $scope
         */
        function getBenchmarkList() {
            Benchmarks.getNames().success(function (data) {
                var nameObjects = data["results"];
                $scope.benchmarkNames = nameObjects.map(function (nameObject) {
                    return nameObject.name;
                });
            });
        }

        /**
         * VARIABLES DEFINITION BLOCK
         */

        $scope.benchmarkName = $routeParams.benchmarkName;
        $rootScope.pageTitle = 'Benchmark results';
        $scope.currentNavItem = 'nav-' + $scope.benchmarkName;
        $scope.operationTypeToLastValueDisplayed = {}; // Map for updating only new points on charts
        $scope.highchartConfigs = {}; // Map for chart configs
        $scope.highchartCharts = {}; // Map for charts
        $scope.updateSemaphore = {}; // Map of semaphores for synchronizing updates
        $scope.updateChartInterval = null;
        $scope.operationArray = ["INSERT", "READ", "UPDATE", "SCAN", "CLEANUP"];

        $scope.operationArray.forEach(initVariables);

        /* Some $scope functions */

        $scope.stopChartUpdating = function () {
            clearInterval($scope.updateChartInterval)
        };

        $scope.$on('$destroy', function () {
            $scope.stopChartUpdating();
            $scope.operationArray.forEach(initVariables);
        });

        $scope.goto = function (path) {
            $location.path(path);
        };

        $scope.deleteBenchmark = function (ev) {
            $scope.loading = true;
            var confirm = $mdDialog.confirm({
                onComplete: function afterShowAnimation() {
                    var $dialog = angular.element(document.querySelector('md-dialog'));
                    var $actionsSection = $dialog.find('md-dialog-actions');
                    var $cancelButton = $actionsSection.children()[0];
                    var $confirmButton = $actionsSection.children()[1];
                    angular.element($confirmButton).addClass('md-raised md-warn');
                    //angular.element($cancelButton).addClass('md-raised');
                }
            })
                .title('Are you sure ?')
                .textContent('Deletion of a benchmark is not reversible once the process is complete.')
                .ariaLabel('Are you sure')
                .targetEvent(ev)
                .ok('Yes I understand the risk')
                .cancel('No');
            $mdDialog.show(confirm).then(function () {
                Benchmarks.delete($scope.benchmarkName)
                    .success(function () {
                        getBenchmarkList();
                        $mdToast.show(
                            $mdToast.simple()
                                .textContent('Benchmark ' + $scope.benchmarkName + ' deleted.')
                                .position("top right")
                                .hideDelay(3000)
                        );
                        $scope.goto("/stats");
                        $scope.loading = false;
                    });
            }, function () {
                // Do something if "no" is answered.
            });


        };

        /* View initialization */

        getBenchmarkList();
        initCharts();
        //launchChartUpdating();
    }])
    .controller('BenchmarkListController', ['$scope', '$rootScope', '$http', 'Benchmarks', function ($scope, $rootScope, $http, Benchmarks) {
        $rootScope.pageTitle = 'Select a benchmark';
        Benchmarks.getNames().success(function (data) {
            var nameObjects = data["results"];
            $scope.benchmarkNames = nameObjects.map(function (nameObject) {
                return nameObject.name;
            });
        });
    }]);