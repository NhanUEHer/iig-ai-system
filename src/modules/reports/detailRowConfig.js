const CONFIG={
  REV:{detailKey:'revenue',codeField:'product_code',nameField:'product_name',groupField:'product_group'},
  ADS:{sections:{traffic:{detailKey:'adsChannels',codeField:'channel_code',nameField:'traffic_source'},products:{detailKey:'adsProducts',codeField:'product_code',nameField:'product_name',groupField:'product_group'}}},
  COM:{detailKey:'social',codeField:'channel_code',nameField:'channel_name'},
  TRADE:{detailKey:'trade',codeField:'organization_code',nameField:'organization_name'},
  TRAIN:{detailKey:'training',codeField:'course_code',nameField:'course_name'},
  PROD:{detailKey:'products',codeField:'activity_code',nameField:'activity_name'}
};
module.exports={DETAIL_ROW_CONFIG:CONFIG};
