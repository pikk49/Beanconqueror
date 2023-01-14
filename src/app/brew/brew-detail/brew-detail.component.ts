import { Component, OnInit, ViewChild } from '@angular/core';
import { UISettingsStorage } from '../../../services/uiSettingsStorage';
import {
  AlertController,
  IonSlides,
  ModalController,
  NavParams,
  Platform,
} from '@ionic/angular';
import { UIHelper } from '../../../services/uiHelper';
import { Brew } from '../../../classes/brew/brew';
import { IBrew } from '../../../interfaces/brew/iBrew';
import { Settings } from '../../../classes/settings/settings';
import { Preparation } from '../../../classes/preparation/preparation';
import { PREPARATION_STYLE_TYPE } from '../../../enums/preparations/preparationStyleTypes';
import { UIBrewHelper } from '../../../services/uiBrewHelper';
import { Chart } from 'chart.js';
import BREW_TRACKING from '../../../data/tracking/brewTracking';
import { UIAnalytics } from '../../../services/uiAnalytics';
import { UIExcel } from '../../../services/uiExcel';
import { UIBeanHelper } from '../../../services/uiBeanHelper';
import { UIPreparationHelper } from '../../../services/uiPreparationHelper';
import { UIMillHelper } from '../../../services/uiMillHelper';
import { TranslateService } from '@ngx-translate/core';
import { BrewFlow, IBrewWaterFlow } from '../../../classes/brew/brewFlow';
import { UIFileHelper } from '../../../services/uiFileHelper';
import { UIAlert } from '../../../services/uiAlert';
import { SocialSharing } from '@ionic-native/social-sharing/ngx';
import { BrewFlowComponent } from '../brew-flow/brew-flow.component';
import { ScreenOrientation } from '@ionic-native/screen-orientation/ngx';
import moment from 'moment';
import BeanconquerorFlowTestDataDummy from '../../../assets/BeanconquerorFlowTestData.json';
import { UILog } from '../../../services/uiLog';
declare var Plotly;
@Component({
  selector: 'brew-detail',
  templateUrl: './brew-detail.component.html',
  styleUrls: ['./brew-detail.component.scss'],
})
export class BrewDetailComponent implements OnInit {
  public static COMPONENT_ID = 'brew-detail';
  public PREPARATION_STYLE_TYPE = PREPARATION_STYLE_TYPE;
  @ViewChild('photoSlides', { static: false }) public photoSlides: IonSlides;
  public data: Brew = new Brew();
  public settings: Settings;

  @ViewChild('cuppingChart', { static: false }) public cuppingChart;
  private brew: IBrew;
  public loaded: boolean = false;

  public flow_profile_raw: BrewFlow = new BrewFlow();

  private weightTrace: any;
  private flowPerSecondTrace: any;
  private realtimeFlowTrace: any;
  private pressureTrace: any;
  private maximizeFlowGraphIsShown: boolean = false;

  public lastChartLayout: any = undefined;
  constructor(
    private readonly modalController: ModalController,
    private readonly navParams: NavParams,
    public uiHelper: UIHelper,
    private readonly uiSettingsStorage: UISettingsStorage,
    private readonly uiBrewHelper: UIBrewHelper,
    private readonly uiAnalytics: UIAnalytics,
    private readonly uiExcel: UIExcel,
    private readonly uiBeanHelper: UIBeanHelper,
    private readonly uiPreparationHelper: UIPreparationHelper,
    private readonly uiMillHelper: UIMillHelper,
    private readonly translate: TranslateService,
    private readonly uiFileHelper: UIFileHelper,
    private readonly uiAlert: UIAlert,
    private readonly socialSharing: SocialSharing,
    private readonly platform: Platform,
    private readonly screenOrientation: ScreenOrientation,
    private readonly alertCtrl: AlertController,
    private readonly uiLog: UILog
  ) {
    this.settings = this.uiSettingsStorage.getSettings();
  }

  public async ionViewWillEnter() {
    this.uiAnalytics.trackEvent(
      BREW_TRACKING.TITLE,
      BREW_TRACKING.ACTIONS.DETAIL
    );
    this.brew = this.navParams.get('brew');
    if (this.brew) {
      const copy: IBrew = this.uiHelper.copyData(this.brew);
      this.data.initializeByObject(copy);
    }
    if (this.showCupping()) {
      // Set timeout else element wont be visible
      setTimeout(() => {
        this.__loadCuppingChart();
      }, 150);
    }

    await this.readFlowProfile();
    setTimeout(() => {
      this.initializeFlowChart();
    }, 150);

    this.loaded = true;
  }

  public async detailBean() {
    await this.uiBeanHelper.detailBean(this.data.getBean());
  }
  public async detailPreparation() {
    await this.uiPreparationHelper.detailPreparation(
      this.data.getPreparation()
    );
  }
  public async detailMill() {
    await this.uiMillHelper.detailMill(this.data.getMill());
  }

  public getPreparation(): Preparation {
    return this.data.getPreparation();
  }
  public showSectionAfterBrew(): boolean {
    return this.uiBrewHelper.showSectionAfterBrew(this.getPreparation());
  }
  public showSectionWhileBrew(): boolean {
    return this.uiBrewHelper.showSectionWhileBrew(this.getPreparation());
  }

  public showSectionBeforeBrew(): boolean {
    return this.uiBrewHelper.showSectionBeforeBrew(this.getPreparation());
  }
  public dismiss(): void {
    try {
      Plotly.purge('flowProfileChart');
    } catch (ex) {}
    this.modalController.dismiss(
      {
        dismissed: true,
      },
      undefined,
      BrewDetailComponent.COMPONENT_ID
    );
  }

  public ngOnInit() {}
  public async edit() {
    const returningBrew: Brew = await this.uiBrewHelper.editBrew(this.data);
    if (returningBrew) {
      this.data = returningBrew;
      await this.readFlowProfile();
      this.initializeFlowChart();
    }
  }
  public formatSeconds(seconds: number, milliseconds) {
    const secs = seconds;
    let formattingStr: string = 'mm:ss';
    const millisecondsEnabled: boolean = this.settings.brew_milliseconds;
    if (millisecondsEnabled) {
      formattingStr = 'mm:ss.SSS';
    }
    const formatted = moment
      .utc(secs * 1000)
      .add('milliseconds', milliseconds)
      .format(formattingStr);
    return formatted;
  }
  private showCupping(): boolean {
    return this.uiBrewHelper.showCupping(this.data);
  }

  private __loadCuppingChart(): void {
    const chartObj = new Chart(
      this.cuppingChart.nativeElement,
      this.uiBrewHelper.getCuppingChartData(this.data) as any
    );
  }

  public initializeFlowChart(): void {
    setTimeout(() => {
      let graphSettings = this.settings.graph.FILTER;
      if (
        this.data.getPreparation().style_type ===
        PREPARATION_STYLE_TYPE.ESPRESSO
      ) {
        graphSettings = this.settings.graph.ESPRESSO;
      }

      this.weightTrace = {
        x: [],
        y: [],
        name: this.translate.instant('BREW_FLOW_WEIGHT'),
        yaxis: 'y',
        type: 'scatter',
        line: {
          shape: 'spline',
          color: '#cdc2ac',
          width: 1,
        },
        visible: graphSettings.weight ? true : 'legendonly',
      };
      this.flowPerSecondTrace = {
        x: [],
        y: [],
        name: this.translate.instant('BREW_FLOW_WEIGHT_PER_SECOND'),
        yaxis: 'y2',
        type: 'scatter',
        line: {
          shape: 'spline',
          color: '#7F97A2',
          width: 1,
        },
        visible: graphSettings.calc_flow ? true : 'legendonly',
      };

      this.realtimeFlowTrace = {
        x: [],
        y: [],
        name: this.translate.instant('BREW_FLOW_WEIGHT_REALTIME'),
        yaxis: 'y2',
        type: 'scatter',
        line: {
          shape: 'spline',
          color: '#09485D',
          width: 1,
        },
        visible: graphSettings.realtime_flow ? true : 'legendonly',
      };

      this.pressureTrace = {
        x: [],
        y: [],
        name: this.translate.instant('BREW_PRESSURE_FLOW'),
        yaxis: 'y4',
        type: 'scatter',
        line: {
          shape: 'spline',
          color: '#05C793',
          width: 1,
        },
        visible: graphSettings.pressure ? true : 'legendonly',
      };
      const startingDay = moment(new Date()).startOf('day');
      // IF brewtime has some seconds, we add this to the delay directly.

      let firstTimestamp;
      if (this.flow_profile_raw.weight.length > 0) {
        firstTimestamp = this.flow_profile_raw.weight[0].timestamp;
      } else {
        firstTimestamp = this.flow_profile_raw.pressureFlow[0].timestamp;
      }
      const delay =
        moment(firstTimestamp, 'HH:mm:ss.SSS').toDate().getTime() -
        startingDay.toDate().getTime();
      if (this.flow_profile_raw.weight.length > 0) {
        for (const data of this.flow_profile_raw.weight) {
          this.weightTrace.x.push(
            new Date(
              moment(data.timestamp, 'HH:mm:ss.SSS').toDate().getTime() - delay
            )
          );
          this.weightTrace.y.push(data.actual_weight);
        }
        for (const data of this.flow_profile_raw.waterFlow) {
          this.flowPerSecondTrace.x.push(
            new Date(
              moment(data.timestamp, 'HH:mm:ss.SSS').toDate().getTime() - delay
            )
          );
          this.flowPerSecondTrace.y.push(data.value);
        }
        if (this.flow_profile_raw.realtimeFlow) {
          for (const data of this.flow_profile_raw.realtimeFlow) {
            this.realtimeFlowTrace.x.push(
              new Date(
                moment(data.timestamp, 'HH:mm:ss.SSS').toDate().getTime() -
                  delay
              )
            );
            this.realtimeFlowTrace.y.push(data.flow_value);
          }
        }
      }
      if (
        this.flow_profile_raw.pressureFlow &&
        this.flow_profile_raw.pressureFlow.length > 0
      ) {
        for (const data of this.flow_profile_raw.pressureFlow) {
          this.pressureTrace.x.push(
            new Date(
              moment(data.timestamp, 'HH:mm:ss.SSS').toDate().getTime() - delay
            )
          );
          this.pressureTrace.y.push(data.actual_pressure);
        }
      }
      const chartData = [
        this.weightTrace,
        this.flowPerSecondTrace,
        this.realtimeFlowTrace,
      ];

      const layout = this.getChartLayout();
      if (layout['yaxis4']) {
        chartData.push(this.pressureTrace);
      }

      Plotly.newPlot(
        'flowProfileChart',
        chartData,
        layout,
        this.getChartConfig()
      );
    }, 100);
  }

  public async maximizeFlowGraph() {
    let actualOrientation;
    if (this.platform.is('cordova')) {
      actualOrientation = this.screenOrientation.type;
    }
    await new Promise(async (resolve) => {
      if (this.platform.is('cordova')) {
        await this.screenOrientation.lock(
          this.screenOrientation.ORIENTATIONS.LANDSCAPE
        );
      }
      resolve(undefined);
    });

    const modal = await this.modalController.create({
      component: BrewFlowComponent,
      id: BrewFlowComponent.COMPONENT_ID,
      breakpoints: [0, 1],
      initialBreakpoint: 1,
      cssClass: 'popover-actions',
      componentProps: {
        brewComponent: this,
        brew: this.data,
        isDetail: true,
      },
    });
    this.maximizeFlowGraphIsShown = true;
    await modal.present();
    await modal.onWillDismiss().then(async () => {
      this.maximizeFlowGraphIsShown = false;
      // If responsive would be true, the add of the container would result into 0 width 0 height, therefore the hack

      if (this.platform.is('cordova')) {
        if (
          this.screenOrientation.type ===
          this.screenOrientation.ORIENTATIONS.LANDSCAPE
        ) {
          if (
            this.screenOrientation.ORIENTATIONS.LANDSCAPE === actualOrientation
          ) {
            // Get back to portrait
            setTimeout(async () => {
              await this.screenOrientation.lock(
                this.screenOrientation.ORIENTATIONS.PORTRAIT_PRIMARY
              );
            }, 50);
          }
        }
        setTimeout(() => {
          this.screenOrientation.unlock();
        }, 150);
      }

      await new Promise((resolve) => {
        setTimeout(async () => {
          document
            .getElementById('canvasContainerBrew')
            .append(document.getElementById('flowProfileChart'));
          resolve(undefined);
        }, 50);
      });

      await new Promise((resolve) => {
        setTimeout(async () => {
          // If we would not set the old height, the graph would explode to big.
          this.initializeFlowChart();
          resolve(undefined);
        }, 50);
      });
    });
  }

  public async shareFlowProfile() {
    /* const fileShare: string = this.flowProfileChartEl.toBase64Image(
      'image/jpeg',
      1
    );*/
    Plotly.Snapshot.toImage(document.getElementById('flowProfileChart'), {
      format: 'jpeg',
    }).once('success', async (url) => {
      try {
        this.socialSharing.share(null, null, url, null);
      } catch (err) {
        this.uiLog.error('Cant share profilechart ' + err.message);
      }
    });
  }

  private getChartLayout() {
    const xAxisVisible: boolean = true;
    const chartWidth: number = document.getElementById(
      'canvasContainerBrew'
    ).offsetWidth;
    const chartHeight: number = 150;

    let tickFormat = '%S';

    if (this.data.brew_time > 59) {
      tickFormat = '%M:' + tickFormat;
    }
    /*  yaxis3: {
        title: '',
        titlefont: {color: '#09485D'},
        tickfont: {color: '#09485D'},
        anchor: 'x',
        overlaying: 'y',
        side: 'right',
        position: 1

      },*/
    const layout = {
      width: chartWidth,
      height: chartHeight,
      margin: {
        l: 20,
        r: 20,
        b: 20,
        t: 20,
        pad: 2,
      },
      showlegend: true,
      legend: {
        x: 0,
        y: 1.3,
        orientation: 'h',
        font: {
          family: 'Karla',
          size: 10,
          color: '#000',
        },
      },
      xaxis: {
        tickformat: tickFormat,
        visible: xAxisVisible,
        domain: [0.1, 0.9],
      },
      yaxis: {
        title: '',
        titlefont: { color: '#cdc2ac' },
        tickfont: { color: '#cdc2ac' },
      },
      yaxis2: {
        title: '',
        titlefont: { color: '#7F97A2' },
        tickfont: { color: '#7F97A2' },
        anchor: 'x',
        overlaying: 'y',
        side: 'right',
        position: 1,
      },
    };

    if (this.flow_profile_raw.pressureFlow.length > 0) {
      layout['yaxis4'] = {
        title: '',
        titlefont: { color: '#05C793' },
        tickfont: { color: '#05C793' },
        anchor: 'free',
        overlaying: 'y',
        side: 'right',
        position: 0.95,
      };
    }
    this.lastChartLayout = layout;
    return layout;
  }

  public async downloadJSONProfile() {
    if (this.data.flow_profile !== '') {
      const jsonParsed = await this.uiFileHelper.getJSONFile(
        this.data.flow_profile
      );
      const filename: string =
        'Beanconqueror_Flowprofile_JSON_' +
        moment().format('HH_mm_ss_DD_MM_YYYY').toString() +
        '.json';
      await this.uiHelper.exportJSON(filename, JSON.stringify(jsonParsed));
      if (this.platform.is('android')) {
        const alert = await this.alertCtrl.create({
          header: this.translate.instant('DOWNLOADED'),
          subHeader: this.translate.instant('FILE_DOWNLOADED_SUCCESSFULLY', {
            fileName: filename,
          }),
          buttons: ['OK'],
        });
        await alert.present();
      }
    }
  }
  public async downloadFlowProfile() {
    await this.uiExcel.exportBrewFlowProfile(this.flow_profile_raw);
  }

  private getChartConfig() {
    const config = {
      displayModeBar: false, // this is the line that hides the bar.
      responsive: true,
    };
    return config;
  }

  private async readFlowProfile() {
    if (this.platform.is('cordova')) {
      if (this.data.flow_profile !== '') {
        await this.uiAlert.showLoadingSpinner();
        try {
          const jsonParsed = await this.uiFileHelper.getJSONFile(
            this.data.flow_profile
          );
          this.flow_profile_raw = jsonParsed;
        } catch (ex) {}

        await this.uiAlert.hideLoadingSpinner();
      }
    } else {
      this.flow_profile_raw = BeanconquerorFlowTestDataDummy as any;
    }
  }

  public getAvgFlow(): number {
    const waterFlows: Array<IBrewWaterFlow> = this.flow_profile_raw.waterFlow;
    let calculatedFlow: number = 0;
    let foundEntries: number = 0;
    for (const water of waterFlows) {
      if (water.value > 0) {
        calculatedFlow += water.value;
        foundEntries += 1;
      }
    }
    if (calculatedFlow > 0) {
      return calculatedFlow / foundEntries;
    }
    return 0;
  }
}
