import fs from 'fs';
import os from 'node:os';
import path from 'path';
import type { INestApplication } from '@nestjs/common';
import { FieldType, Colors, Relationship } from '@teable/core';
import type { INotifyVo } from '@teable/openapi';
import {
  exportCsvFromTable as apiExportCsvFromTable,
  createTable as apiCreateTable,
  createField as apiCreateField,
  getSignature as apiGetSignature,
  uploadFile as apiUploadFile,
  notify as apiNotify,
  createRecords as apiCreateRecords,
  deleteTable as apiDeleteTable,
  UploadType,
} from '@teable/openapi';

import { initApp } from './utils/init-app';

let app: INestApplication;
const baseId = globalThis.testConfig.baseId;
const userId = globalThis.testConfig.userId;
let txtFileData: INotifyVo;

const subFields = [
  {
    type: FieldType.SingleLineText,
    name: 'sub_Name',
  },
  {
    type: FieldType.Number,
    name: 'sub_Number',
  },
  {
    type: FieldType.Checkbox,
    name: 'sub_Checkbox',
  },
  {
    type: FieldType.SingleSelect,
    name: 'sub_SingleSelect',
    options: {
      choices: [
        { id: 'choX', name: 'sub_x', color: Colors.Cyan },
        { id: 'choY', name: 'sub_y', color: Colors.Blue },
        { id: 'choZ', name: 'sub_z', color: Colors.Gray },
      ],
    },
  },
];

const mainFields = [
  {
    type: FieldType.Number,
    name: 'Number field',
  },
  {
    type: FieldType.Checkbox,
    name: 'Checkbox field',
  },
  {
    type: FieldType.SingleSelect,
    name: 'Select field',
    options: {
      choices: [
        { id: 'choX', name: 'x', color: Colors.Cyan },
        { id: 'choY', name: 'y', color: Colors.Blue },
        { id: 'choZ', name: 'z', color: Colors.Gray },
      ],
    },
  },
  {
    type: FieldType.Date,
    name: 'Date field',
    options: {
      formatting: {
        timeZone: 'Asia/Shanghai',
        date: 'YYYY-MM-DD',
        time: 'None',
      },
    },
  },
  {
    type: FieldType.Attachment,
    name: 'Attachment field',
  },
  {
    type: FieldType.User,
    name: 'User Field',
    options: {
      isMultiple: false,
      shouldNotify: false,
    },
  },
];

beforeAll(async () => {
  const appCtx = await initApp();
  app = appCtx.app;

  const tmpDir = os.tmpdir();
  const format = 'txt';
  const tmpPath = path.resolve(path.join(tmpDir, `test.${format}`));
  const txtData = `field_1,field_2,field_3,field_4,field_5,field_6
  1,string_1,true,2022-11-10 16:00:00,,"long
  text"
  2,string_2,false,2022-11-11 16:00:00,,`;
  const contentType = 'text/plain';

  fs.writeFileSync(tmpPath, txtData);

  const file = fs.readFileSync(tmpPath);
  const stats = fs.statSync(tmpPath);

  const { token, requestHeaders } = (
    await apiGetSignature(
      {
        type: UploadType.Import,
        contentLength: stats.size,
        contentType: contentType,
      },
      undefined
    )
  ).data;

  await apiUploadFile(token, file, requestHeaders);

  const { data } = await apiNotify(token);
  txtFileData = data;
});

afterAll(async () => {
  await app.close();
});

const createRecordsWithLink = async (mainTableId: string, subTableId: string) => {
  return apiCreateRecords(mainTableId, {
    typecast: true,
    records: [
      {
        fields: {
          ['Attachment field']: [{ ...txtFileData, id: 'actxxxxxx', name: 'test.txt' }],
          ['Date field']: '2022-11-28',
          ['Text field']: 'txt1',
          ['Number field']: 1,
          ['Checkbox field']: true,
          ['Select field']: 'x',
          ['Link field']: [
            {
              id: subTableId,
            },
          ],
        },
      },
      {
        fields: {
          ['Date field']: '2022-11-28',
          ['Text field']: 'txt2',
          ['Select field']: 'y',
          ['User Field']: {
            title: 'test',
            id: userId,
          },
        },
      },
      {
        fields: {
          ['Select field']: 'z',
          ['Checkbox field']: true,
        },
      },
    ],
  });
};

describe('/export/${tableId} OpenAPI ExportController (e2e) Get csv stream from table (Get) ', () => {
  it(`should return a csv stream from table and compatible all fields`, async () => {
    const mainTable = await apiCreateTable(baseId, {
      name: 'main',
      fields: [
        {
          type: FieldType.SingleLineText,
          name: 'Text field',
        },
      ],
      records: [],
    });

    for (let i = 0; i < mainFields.length; i++) {
      await apiCreateField(mainTable.data.id, mainFields[i]);
    }

    const subTable = await apiCreateTable(baseId, {
      name: 'subTable',
      fields: subFields,
      records: [
        {
          fields: {
            ['sub_Name']: 'Name1',
            ['sub_Number']: 1,
            ['sub_Checkbox']: true,
            ['sub_SingleSelect']: 'sub_y',
          },
        },
        {
          fields: {
            ['sub_Name']: 'Name2',
            ['sub_Number']: 2,
            ['sub_Checkbox']: true,
            ['sub_SingleSelect']: 'sub_x',
          },
        },
        {
          fields: {
            ['sub_Name']: 'Name3',
            ['sub_Number']: 3,
          },
        },
      ],
    });

    const {
      data: { id: linkFieldId },
    } = await apiCreateField(mainTable.data.id, {
      type: FieldType.Link,
      name: 'Link field',
      options: {
        relationship: Relationship.ManyMany,
        foreignTableId: subTable.data.id,
        isOneWay: false,
      },
    });

    for (let i = 0; i < subFields.length; i++) {
      const { name, type } = subFields[i];
      await apiCreateField(mainTable.data.id, {
        name: `Link field from lookups ${name}`,
        type: type,
        isLookup: true,
        lookupOptions: {
          foreignTableId: subTable.data.id,
          lookupFieldId: subTable.data.fields[i].id,
          linkFieldId: linkFieldId,
        },
      });
    }

    await createRecordsWithLink(mainTable.data.id, subTable.data.records[0].id);

    const exportRes = await apiExportCsvFromTable(mainTable.data.id);
    const disposition = exportRes?.headers['content-disposition'];
    const contentType = exportRes?.headers['content-type'];
    const { data: csvData } = exportRes;

    await apiDeleteTable(baseId, mainTable.data.id);
    await apiDeleteTable(baseId, subTable.data.id);

    expect(disposition).toBe(`attachment; filename=${encodeURIComponent(mainTable.data.name)}.csv`);
    expect(contentType).toBe('text/csv');
    expect(csvData).toBe(
      `Text field,Number field,Checkbox field,Select field,Date field,Attachment field,User Field,Link field,Link field from lookups sub_Name,Link field from lookups sub_Number,Link field from lookups sub_Checkbox,Link field from lookups sub_SingleSelect\r\ntxt1,1.00,true,x,2022-11-28,test.txt ${txtFileData.presignedUrl},,Name1,Name1,1.00,true,sub_y\r\ntxt2,,,y,2022-11-28,,test,,,,,\r\n,,true,z,,,,,,,,`
    );
  });

  it(`should return a csv stream from table with special character table name`, async () => {
    const mainTable = await apiCreateTable(baseId, {
      name: '测试😄',
      fields: [
        {
          type: FieldType.SingleLineText,
          name: 'Text field',
        },
      ],
      records: [],
    });

    for (let i = 0; i < mainFields.length; i++) {
      await apiCreateField(mainTable.data.id, mainFields[i]);
    }

    const subTable = await apiCreateTable(baseId, {
      name: 'subTable',
      fields: subFields,
      records: [
        {
          fields: {
            ['sub_Name']: 'Name1',
            ['sub_Number']: 1,
            ['sub_Checkbox']: true,
            ['sub_SingleSelect']: 'sub_y',
          },
        },
        {
          fields: {
            ['sub_Name']: 'Name2',
            ['sub_Number']: 2,
            ['sub_Checkbox']: true,
            ['sub_SingleSelect']: 'sub_x',
          },
        },
        {
          fields: {
            ['sub_Name']: 'Name3',
            ['sub_Number']: 3,
          },
        },
      ],
    });

    const {
      data: { id: linkFieldId },
    } = await apiCreateField(mainTable.data.id, {
      type: FieldType.Link,
      name: 'Link field',
      options: {
        relationship: Relationship.ManyMany,
        foreignTableId: subTable.data.id,
        isOneWay: false,
      },
    });

    for (let i = 0; i < subFields.length; i++) {
      const { name, type } = subFields[i];
      await apiCreateField(mainTable.data.id, {
        name: `Link field from lookups ${name}`,
        type: type,
        isLookup: true,
        lookupOptions: {
          foreignTableId: subTable.data.id,
          lookupFieldId: subTable.data.fields[i].id,
          linkFieldId: linkFieldId,
        },
      });
    }

    await createRecordsWithLink(mainTable.data.id, subTable.data.records[0].id);

    const exportRes = await apiExportCsvFromTable(mainTable.data.id);
    const disposition = exportRes?.headers['content-disposition'];
    const contentType = exportRes?.headers['content-type'];
    const { data: csvData } = exportRes;

    await apiDeleteTable(baseId, mainTable.data.id);
    await apiDeleteTable(baseId, subTable.data.id);

    expect(disposition).toBe(`attachment; filename=${encodeURIComponent(mainTable.data.name)}.csv`);
    expect(contentType).toBe('text/csv');
    expect(csvData).toBe(
      `Text field,Number field,Checkbox field,Select field,Date field,Attachment field,User Field,Link field,Link field from lookups sub_Name,Link field from lookups sub_Number,Link field from lookups sub_Checkbox,Link field from lookups sub_SingleSelect\r\ntxt1,1.00,true,x,2022-11-28,test.txt ${txtFileData.presignedUrl},,Name1,Name1,1.00,true,sub_y\r\ntxt2,,,y,2022-11-28,,test,,,,,\r\n,,true,z,,,,,,,,`
    );
  });
});
