/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable @typescript-eslint/naming-convention */
import type { INestApplication } from '@nestjs/common';
import type { ICreateRecordsRo } from '@teable-group/core';
import type request from 'supertest';
import type { IDbProvider } from '../src/db-provider/db.provider.interface';
import { initApp } from './utils/init-app';

const assertData = {
  name: 'Project Management',
  description: 'A table for managing projects',
  fields: [
    {
      name: 'Project Name',
      description: 'The name of the project',
      type: 'singleLineText',
      notNull: true,
      unique: true,
    },
    {
      name: 'Project Description',
      description: 'A brief description of the project',
      type: 'singleLineText',
    },
    {
      name: 'Project Status',
      description: 'The current status of the project',
      type: 'singleSelect',
      options: {
        choices: [
          {
            name: 'Not Started',
            color: 'gray',
          },
          {
            name: 'In Progress',
            color: 'blue',
          },
          {
            name: 'Completed',
            color: 'green',
          },
        ],
      },
    },
    {
      name: 'Start Date',
      description: 'The date the project started',
      type: 'date',
    },
    {
      name: 'End Date',
      description: 'The date the project is expected to end',
      type: 'date',
    },
  ],
  views: [
    {
      name: 'Grid View',
      description: 'A grid view of all projects',
      type: 'grid',
      options: {
        rowHeight: 'short',
      },
    },
    {
      name: 'Kanban View',
      description: 'A kanban view of all projects',
      type: 'kanban',
      options: {
        groupingFieldId: 'Project Status',
      },
    },
  ],
  records: [
    {
      fields: {
        'Project Name': 'Project A',
        'Project Description': 'A project to develop a new product',
        'Project Status': 'Not Started',
      },
    },
    {
      fields: {
        'Project Name': 'Project B',
        'Project Description': 'A project to improve customer service',
        'Project Status': 'In Progress',
      },
    },
  ],
};

describe('OpenAPI FieldController (e2e)', () => {
  let app: INestApplication;
  let tableId = '';
  let request: request.SuperAgentTest;
  let dbProvider: IDbProvider;

  const baseId = globalThis.testConfig.baseId;
  beforeAll(async () => {
    const appCtx = await initApp();
    app = appCtx.app;
    dbProvider = app.get('DbProvider');
    request = appCtx.request;
  });

  afterAll(async () => {
    await request.delete(`/api/base/${baseId}/table/arbitrary/${tableId}`);

    await app.close();
  });

  it('/api/table/ (POST) with assertData data', async () => {
    const result = await request.post(`/api/base/${baseId}/table`).send(assertData).expect(201);

    tableId = result.body.id;
    const recordResult = await request.get(`/api/table/${tableId}/record`).expect(200);

    expect(recordResult.body.records).toHaveLength(2);
  });

  it('/api/table/ (POST) empty', async () => {
    const result = await request
      .post(`/api/base/${baseId}/table`)
      .send({ name: 'new table' })
      .expect(201);

    tableId = result.body.id;
    const recordResult = await request.get(`/api/table/${tableId}/record`).expect(200);
    expect(recordResult.body.records).toHaveLength(3);
  });

  it('should refresh table lastModifyTime when add a record', async () => {
    const result = await request
      .post(`/api/base/${baseId}/table`)
      .send({ name: 'new table' })
      .expect(201);
    const prevTime = result.body.lastModifiedTime;
    tableId = result.body.id;

    await request
      .post(`/api/table/${tableId}/record`)
      .send({ records: [{ fields: {} }] } as ICreateRecordsRo);

    const tableResult = await request.get(`/api/base/${baseId}/table/${tableId}`).expect(200);
    const currTime = tableResult.body.lastModifiedTime;
    expect(new Date(currTime).getTime() > new Date(prevTime).getTime()).toBeTruthy();
  });

  it('should create table with add a record', async () => {
    const timeStr = new Date().getTime() + '';
    const result = await request
      .post(`/api/base/${baseId}/table`)
      .send({ name: 'new table', dbTableName: 'my_awesome_table_name' + timeStr })
      .expect(201);
    tableId = result.body.id;

    const tableResult = await request.get(`/api/base/${baseId}/table/${tableId}`).expect(200);

    expect(tableResult.body.dbTableName).toEqual(
      dbProvider.generateDbTableName(baseId, 'my_awesome_table_name' + timeStr)
    );
  });
});
