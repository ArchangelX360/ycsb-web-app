angular.module('stats', [])
    .directive('hcOperationChart', function () {
        return {
            restrict: 'E',
            template: '<div></div>',
            scope: {
                series: '=',
                operation: '@',
                updatefunc: '=',
                initfunc: '=',
                updateinterval: '='
            },
            link: function (scope, element) {
                element.on('$destroy', function () {
                    clearInterval(scope.updateinterval)
                });

                Highcharts.StockChart(element[0], {
                    chart: {
                        zoomType: 'x',
                        height: 650,
                        events: {
                            load: function () {
                                // set up the updating of the chart each second
                                var chart = this;
                                scope.initfunc(chart, scope.operation);
                                scope.updateinterval = setInterval(function () {
                                    var extremesObject = chart.xAxis[0].getExtremes();
                                    scope.updatefunc(chart, scope.operation, Math.round(extremesObject.dataMax));
                                }, 3000);
                            }
                        }
                    },
                    tooltip: {
                        formatter: function () {
                            var s = 'Measure #<b>' + this.x + '</b>';

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
                        buttons: [
                            {
                                type: 'millisecond',
                                count: 1,
                                text: '1op'
                            }, {
                                type: 'millisecond',
                                count: 10,
                                text: '10op'
                            }, {
                                type: 'millisecond',
                                count: 10000,
                                text: '10000op'
                            }, {
                                type: 'millisecond',
                                count: 50000,
                                text: '50000op'
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
                            includeInCSVExport: false,
                            id: 'nav'
                        },
                        xAxis: {
                            labels: {
                                formatter: function () {
                                    return this.value;
                                }
                            }
                        }
                    },
                    xAxis: {
                        labels: {
                            formatter: function () {
                                return this.value;
                            }
                        }
                    },
                    series: [
                        {
                            id: scope.operation + '_latency',
                            name: scope.operation + ' latency',
                            data: []
                        },
                        {
                            id: scope.operation + '_latency_average',
                            name: 'Average ' + scope.operation + ' latency',
                            data: []
                        }
                    ],
                    title: {
                        text: scope.operation + ' latency'
                    }
                });
            }
        };
    })
    // inject the Benchmark service factory into our controller
    .controller('StatController', ['$scope', '$rootScope', '$http', 'Benchmarks', '$routeParams', '$mdDialog',
        '$mdToast', '$location', 'ToastService', '$log', function ($scope, $rootScope, $http, Benchmarks, $routeParams,
                                                                   $mdDialog, $mdToast, $location, ToastService, $log) {

            /** CONFIGURATION VARIABLES **/
            $scope.MAX_POINTS = 20000; // maximal number of points you can get from MongoDB
            // (depends on your browser/computer performance) and has a undetermined upper limit with NodeJS
            $scope.operationArray = ["INSERT", "READ", "UPDATE", "READ-MODIFY-WRITE", "CLEANUP", "SCAN", "DELETE"];

            /* VARIABLE INITIALIZATION */

            $scope.intervals = {};
            getBenchmarkList();
            $scope.benchmarkName = $routeParams.benchmarkName;
            $rootScope.pageTitle = ($scope.benchmarkName) ? 'Benchmark results' : 'Select a benchmark';
            $scope.currentNavItem = 'nav-' + $scope.benchmarkName;

            $scope.benchmarkName = $routeParams.benchmarkName;
            $scope.updateSemaphore = {}; // Map of semaphores for synchronizing updates
            $scope.packetSizes = {};
            $scope.operationArray.forEach(function (operationType) {
                $scope.updateSemaphore[operationType] = true;
                $scope.packetSizes[operationType] = 1;
                $scope.intervals[operationType] = null;
            });
            $scope.updateIntervalsActive = false;

            /* CHART FUNCTIONS */

            /**
             * Free update semaphore of a specific operationType chart
             * @param operationType the operationType string
             */
            function freeSemaphore(operationType) {
                $scope.updateSemaphore[operationType] = false;
            }

            /**
             * Convert stored raw values from YCSB to Highchart formatting
             *
             * NOTE : this function could be overwritten to handle every kind of dataset like candlestick for example
             *
             * @param rawValues YCSB raw DB values
             * @returns {*} Highchart formatted data
             */
            function convertToSerie(rawValues) {
                return rawValues.map(function (measureObj) {
                    return [measureObj.num, measureObj.latency]
                });
            }

            /**
             * Update an average value with a O(1) complexity algorithm
             * @param average the former average
             * @param size the size of the serie
             * @param newValue the new value added to the serie (that's why we need a new average)
             * @returns {number} the new average
             */
            function updateAverage(average, size, newValue) {
                return (size * average + newValue) / (size + 1);
            }

            /**
             * Create an average serie data array from a value and an original serie
             * @param serieData the original serie data array of which we want an average serie
             * @param value the average
             * @returns {{name: string, data: *}} the average Highchart serie
             */
            function createAverageData(serieData, value) {
                return serieData.map(function (point) {
                    return [point[0], value];
                })
            }

            /**
             * Return the serie average with an O(n) complexity algorithm
             * @param serieData the serie data
             * @returns {number} the average of the serie
             */
            function getAverage(serieData) {
                var total = serieData.reduce(function (previous, current) {
                    return previous + current[1];
                }, 0);
                return total / serieData.length;
            }

            /**
             * Return points of the series of the given id
             * @param chart the chart object
             * @param id the id of the series
             * @returns {Array} current points in the series
             */
            function getAllDataPoints(chart, id) {
                var points = [];
                var xData = chart.get(id).xData;
                var yData = chart.get(id).yData;
                for (var i = 0; i < xData.length; i++) {
                    points.push([xData[i], yData[i]]);
                }
                return points;
            }

            /**
             * Updates series of a specific operationType
             * @param chart the chart object
             * @param operationType the operation type
             * @param rawPoints the points to add
             * @param packetSize the size of the packet used
             */
            function updateSeries(chart, operationType, rawPoints, packetSize) {
                if (rawPoints.length > 0) {
                    $log.info('[' + operationType + '] Updating series');

                    $scope.packetSizes[operationType] = packetSize;
                    var newPointsData = convertToSerie(rawPoints);
                    var originalSerieLength = chart.get(operationType + '_latency').xData.length;
                    var average = chart.get(operationType + '_latency_average').yData[0];

                    newPointsData.forEach(function (point) {
                        average = updateAverage(average, originalSerieLength, point[1]);
                    });

                    var oldPoints = getAllDataPoints(chart, operationType + '_latency');
                    var completeData = oldPoints.concat(newPointsData);

                    chart.get(operationType + '_latency').setData(completeData);
                    chart.get(operationType + '_latency_average').setData(createAverageData(completeData, average));

                    $log.info('%c[' + operationType + '] Chart updated', 'color: green');
                } else {
                    $log.info('%c[' + operationType + '] No new points found', 'color: orange');
                }
                chart.hideLoading();
                freeSemaphore(operationType)
            }

            /**
             * Update routine that decide if the chart needs a full update, a partial update or an init
             * @param chart the chart object
             * @param operationType the operation type
             * @param lastInserted the number (num) of the last inserted point into the specified operation chart
             */
            $scope.updateRoutine = function (chart, operationType, lastInserted) {
                if (!$scope.updateSemaphore[operationType]) {
                    $log.info('[' + operationType + '] Updating chart');
                    $scope.updateSemaphore[operationType] = true;

                    Benchmarks.getSize($scope.benchmarkName, operationType).then(function (result) {
                        var datasetSize = result.data;
                        if (datasetSize > $scope.MAX_POINTS) {
                            var packetSize = Math.floor(datasetSize / $scope.MAX_POINTS) + 1;

                            if (packetSize != $scope.packetSizes[operationType]) {
                                // FIXME: careful this should decrease view performance a lot !
                                lastInserted = 0; // We are rebuilding the whole series to have quality consistency
                            }

                            Benchmarks.getByNameByOperationTypeByQuality($scope.benchmarkName, operationType,
                                lastInserted, "MAX", $scope.MAX_POINTS, packetSize)
                                .then(function (result) {
                                    var newPoints = result.data;
                                    if (packetSize != $scope.packetSizes[operationType]) {
                                        initSeries(chart, operationType, newPoints, packetSize);
                                    } else {
                                        updateSeries(chart, operationType, newPoints, packetSize);
                                    }
                                }, function (err) {
                                    ToastService.showToast(err.data, 'error');
                                });
                        } else {
                            Benchmarks.getByNameByOperationTypeFrom($scope.benchmarkName, operationType, lastInserted)
                                .then(function (result) {
                                    var newPoints = result.data;
                                    var packetSize = $scope.packetSizes[operationType];

                                    if (datasetSize == newPoints.length) {
                                        initSeries(chart, operationType, newPoints, packetSize);
                                    } else {
                                        updateSeries(chart, operationType, newPoints, packetSize);
                                    }
                                }, function (err) {
                                    ToastService.showToast(err.data, 'error');
                                });
                        }
                    }, function (err) {
                        ToastService.showToast(err.data, 'error');
                    });
                }
            };

            /**
             * Initialize a specified operation chart
             * @param chart the chart object
             * @param operationType the operation type
             * @param rawPoints points use for initialisation
             * @param packetSize the size of packet used for this initialization
             */
            function initSeries(chart, operationType, rawPoints, packetSize) {
                if (rawPoints.length > 0) {
                    $log.info('[' + operationType + '] Initializing series');

                    $scope.packetSizes[operationType] = packetSize;

                    var points = convertToSerie(rawPoints);

                    chart.get(operationType + '_latency').setData(points);
                    chart.get(operationType + '_latency_average')
                        .setData(createAverageData(points, getAverage(points)));

                    $log.info('%c[' + operationType + '] Chart initialized', 'color: green');
                    chart.hideLoading();
                } else {
                    chart.showLoading('No data found.');
                    $log.info('%c[' + operationType + '] No points found', 'color: orange');
                }
                $scope.updateIntervalsActive = true;
                freeSemaphore(operationType);
            }

            /**
             * Initialization routine which define if the chart should be init full all points or with a smaller amount
             * @param chart the object chart
             * @param operationType the operation type
             */
            $scope.initRoutine = function (chart, operationType) {
                $log.info('[' + operationType + '] Initializing chart');
                chart.showLoading('Loading data from server...');

                Benchmarks.getSize($scope.benchmarkName, operationType).then(function (result) {
                    var datasetSize = result.data;
                    if (datasetSize > $scope.MAX_POINTS) {
                        var packetSize = Math.floor(datasetSize / $scope.MAX_POINTS) + 1;
                        Benchmarks.getByNameByOperationTypeByQuality($scope.benchmarkName, operationType, 0,
                            "MAX", $scope.MAX_POINTS, packetSize).then(function (result) {
                            var rawPoints = result.data;
                            initSeries(chart, operationType, rawPoints, packetSize);
                        }, function (err) {
                            ToastService.showToast(err.data, 'error');
                        });
                    } else {
                        Benchmarks.getByNameByOperationType($scope.benchmarkName, operationType)
                            .then(function (result) {
                                var rawPoints = result.data;
                                initSeries(chart, operationType, rawPoints, 1);
                            }, function (err) {
                                ToastService.showToast(err.data, 'error');
                            });
                    }
                }, function (err) {
                    ToastService.showToast(err.data, 'error');
                });
            };

            /**
             * Clears all chart update intervals
             */
            $scope.clearUpdateIntervals = function () {
                for (var operationType in $scope.intervals) {
                    if ($scope.intervals.hasOwnProperty(operationType)) {
                        clearInterval($scope.intervals[operationType]);
                        $log.info("%c[" + operationType + "] Update interval cleared.", 'color: rgb(68,138,255)');
                    }
                }
                $scope.updateIntervalsActive = false;
                ToastService.showToast("Updates stopped.", 'warn');
            };

            /* DELETION FUNCTIONS */

            /**
             * Launch specified benchmark DB deletion
             * @param benchmarkName the name of the benchmark
             */
            function deleteBenchmark(benchmarkName) {
                Benchmarks.delete(benchmarkName)
                    .then(function () {
                        ToastService.showToast('Benchmark ' + benchmarkName + ' deleted.', 'warn');
                        $location.path("/stats");
                        $scope.loading = false;
                    }, function (err) {
                        ToastService.showToast(err.data, 'error');
                    });
            }

            /**
             * Shows confirm popup to delete a benchmark and launches its deletion if user answer yes
             * @param ev the event
             */
            $scope.confirmDeletionBenchmark = function (ev) {
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
                    $scope.loading = true;
                    deleteBenchmark($scope.benchmarkName);
                }, function () {
                    // Do something if "no" is answered.
                });
            };

            /* NAV FUNCTIONS */

            /**
             * Get benchmark name list to fill the nav
             */
            function getBenchmarkList() {
                Benchmarks.getNames().then(function (result) {
                    $scope.benchmarkNames = result.data;
                }, function (err) {
                    ToastService.showToast(err.data, 'error');
                })
            }

        }
    ]);