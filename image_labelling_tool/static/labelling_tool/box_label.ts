/*
The MIT License (MIT)

Copyright (c) 2015 University of East Anglia, Norwich, UK

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

Developed by Geoffrey French in collaboration with Dr. M. Fisher and
Dr. M. Mackiewicz.
 */

/// <reference path="./math_primitives.ts" />
/// <reference path="./abstract_label.ts" />
/// <reference path="./abstract_tool.ts" />
/// <reference path="./select_tools.ts" />
/// <reference path="./root_label_view.ts" />

module labelling_tool {
    /*
    Box label model
     */
    interface BoxLabelModel extends AbstractLabelModel {
        centre: Vector2;
        size: Vector2;
    }

    function new_BoxLabelModel(centre: Vector2, size: Vector2, label_class: string, source: string): BoxLabelModel {
        return {label_type: 'box', label_class: label_class, source: source, anno_data: {}, centre: centre, size: size};
    }

    function BoxLabel_box(label: BoxLabelModel): AABox {
        var lower = {x: label.centre.x - label.size.x*0.5, y: label.centre.y - label.size.y*0.5};
        var upper = {x: label.centre.x + label.size.x*0.5, y: label.centre.y + label.size.y*0.5};
        return new AABox(lower, upper);
    }

    interface TableStructure {
        bbox: AABox;
        columns: AABox[];
        entity: AbstractLabelEntity<AbstractLabelModel>;
        label: string;
        rows: AABox[];
        threshold: Vector2;
    }

    /*
    Box label entity
     */
    export class BoxLabelEntity extends AbstractLabelEntity<BoxLabelModel> {
        _rect: any;
        _table: TableStructure|null;


        constructor(view: RootLabelView, model: BoxLabelModel) {
            super(view, model);
            this._table = null;
        }


        attach() {
            super.attach();

            this._rect = this.root_view.world.append("rect")
                .attr("class", "anno_label")
                .attr("x", 0).attr("y", 0)
                .attr("width", 0).attr("height", 0);

            this.update();

            var self = this;
            this._rect.on("mouseover", function() {
                self._on_mouse_over_event();
            }).on("mouseout", function() {
                self._on_mouse_out_event();
            });


            this._update_style();
        };

        detach() {
            this._rect.remove();
            this._rect = null;
            super.detach();
        }


        _on_mouse_over_event() {
            for (var i = 0; i < this._event_listeners.length; i++) {
                this._event_listeners[i].on_mouse_in(this);
            }
        }

        _on_mouse_out_event() {
            for (var i = 0; i < this._event_listeners.length; i++) {
                this._event_listeners[i].on_mouse_out(this);
            }
        }



        update() {
            var box = BoxLabel_box(this.model);
            var size = box.size();

            this._rect
                .attr('x', box.lower.x).attr('y', box.lower.y)
                .attr('width', size.x).attr('height', size.y);
        }

        commit() {
            this.root_view.commit_model(this.model);
        }

        _update_style() {
            if (this._attached) {
                var stroke_colour: Colour4 = this._outline_colour();

                var vis: LabelVisibility = this.get_visibility();
                if (vis == LabelVisibility.HIDDEN) {
                    this._rect.attr("visibility", "hidden");
                }
                else if (vis == LabelVisibility.FAINT) {
                    stroke_colour = stroke_colour.with_alpha(0.2);
                    this._rect.attr("style", "fill:none;stroke:" + stroke_colour.to_rgba_string() + ";stroke-width:1");
                    this._rect.attr("visibility", "visible");
                }
                else if (vis == LabelVisibility.FULL) {
                    var circle_fill_colour = this.root_view.view.colour_for_label_class(this.model.label_class);
                    if (this._hover) {
                        circle_fill_colour = circle_fill_colour.lighten(0.4);
                    }
                    circle_fill_colour = circle_fill_colour.with_alpha(0.35);

                    stroke_colour = stroke_colour.with_alpha(0.5);

                    this._rect.attr("style", "fill:" + circle_fill_colour.to_rgba_string() + ";stroke:" + stroke_colour.to_rgba_string() + ";stroke-width:1");
                    this._rect.attr("visibility", "visible");
                }
            }
        }

        compute_centroid(): Vector2 {
            return this.model.centre;
        };

        compute_bounding_box(): AABox {
            return BoxLabel_box(this.model);
        };

        contains_pointer_position(point: Vector2): boolean {
            return this.compute_bounding_box().contains_point(point);
        }

        distance_to_point(point: Vector2): number {
            return BoxLabel_box(this.model).distance_to(point);
        }

        is_table_structure_label(label?: string): boolean {
            const label_class = label ?? this?.model?.label_class;
            if (label_class === null || label_class === undefined) return false;
            const table_structure_classes = [
                "table_column",
                "table_column_header",
                "table_projected_row_header",
                "table_row",
                "table_spanning_cell",
            ]
            return table_structure_classes.indexOf(label_class) !== -1;
        }

        get_parent_table(): TableStructure|null {
            if (this._table !== null) return this._table;
            if (!this.is_table_structure_label()) return null;
            const entity_id = this.get_entity_id();

            const entities: AbstractLabelEntity<AbstractLabelModel>[] = this.root_view.get_entities();
            const table_entities = entities.filter((e) => e.model.label_class === "table");
            table_entities.forEach((entity) => {
                if (entity.distance_to_point(this.compute_centroid()) < 10) {
                    const bbox = entity.compute_bounding_box();
                    const columns = entities.filter((e) => {
                        return entity_id !== e.get_entity_id() && e.model.label_class === "table_column" && bbox.contains_point(e.compute_bounding_box().centre());
                    }).map((e) => e.compute_bounding_box());
                    const rows = entities.filter((e) => {
                        return entity_id !== e.get_entity_id() && e.model.label_class === "table_row" && bbox.contains_point(e.compute_bounding_box().centre());
                    }).map((e) => e.compute_bounding_box());

                    this._table = {
                        bbox,
                        columns,
                        entity,
                        label: this.model.label_class,
                        rows,
                        threshold: {
                            x: Math.max(10, Math.ceil((bbox.upper.x - bbox.lower.x) / 100)),
                            y: Math.max(10, Math.ceil((bbox.upper.y - bbox.lower.y) / 100)),
                        }
                    };
                    return this._table;
                }
            });

            return null;
        }
    }


    register_entity_factory('box', (root_view: RootLabelView, model: AbstractLabelModel) => {
            return new BoxLabelEntity(root_view, model as BoxLabelModel);
    });


    /*
    Draw box tool
     */
    export class DrawBoxTool extends AbstractTool {
        entity: BoxLabelEntity;
        _start_point: Vector2;
        _current_point: Vector2;

        constructor(view: RootLabelView, entity: BoxLabelEntity) {
            super(view);
            this.entity = entity;
            this._start_point = null;
            this._current_point = null;
        }

        on_init() {
        };

        on_shutdown() {
        };

        on_switch_in(pos: Vector2) {
            if (this._start_point !== null) {
                this._current_point = pos;
                this.update_box();
            }
        };

        on_switch_out(pos: Vector2) {
            if (this._start_point !== null) {
                this._current_point = null;
                this.update_box();
            }
        };

        on_cancel(pos: Vector2): boolean {
            if (this.entity !== null) {
                if (this._start_point !== null) {
                    this.destroy_entity();
                    this._start_point = null;
                }
            }
            else {
                this._view.unselect_all_entities();
                this._view.view.set_current_tool(new SelectEntityTool(this._view));
            }
            return true;
        };

        on_left_click(pos: Vector2, event: any) {
            if (this._start_point === null) {
                this._start_point = pos;
                this._current_point = pos;
                this.create_entity(pos);
            }
            else {
                this._current_point = pos;
                this.update_box();
                this.entity.commit();
                this._start_point = null;
                this._current_point = null;
            }
        };

        on_move(pos: Vector2) {
            if (this._start_point !== null) {
                this._current_point = pos;
                this.update_box();
            }
        };



        create_entity(pos: Vector2) {
            var label_class = this._view.view.get_label_class_for_new_label();
            var model = new_BoxLabelModel(pos, {x: 0.0, y: 0.0}, label_class, "manual");
            var entity = this._view.get_or_create_entity_for_model(model);
            this.entity = entity;
            // Freeze to prevent this temporary change from being sent to the backend
            this._view.view.freeze();
            this._view.add_child(entity);
            this._view.select_entity(entity, false, false);
            this._view.view.thaw();
        };

        destroy_entity() {
            // Freeze to prevent this temporary change from being sent to the backend
            this._view.view.freeze();
            this.entity.destroy();
            this.entity = null;
            this._view.view.thaw();
        };

        update_box() {
            if (this.entity !== null) {
                var box: AABox = null;
                if (this._start_point !== null) {
                    if (this._current_point !== null) {
                        box = AABox_from_points([this._start_point, this._current_point]);
                        box = this.get_table_box(this._start_point, this._current_point) ?? box;
                    }
                    else {
                        box = new AABox(this._start_point, this._start_point);
                    }
                }
                this.entity.model.centre = box.centre();
                this.entity.model.size = box.size();
                this.entity.update();
            }
        };

        get_table_box(_start: Vector2, _current: Vector2): AABox|null {
            const table = this.entity.get_parent_table();
            if (table === null) return null;

            const bbox = table.bbox;
            const start = bbox.closest_point_to(_start);
            const current = bbox.closest_point_to(_current);
            let box: AABox = null;

            if (table.label === "table_row" || table.label === "table_column_header" || table.label === "table_projected_row_header") {
                // full width
                start.x = bbox.closest_boundary_to(start).x;
                current.x = start.x === bbox.lower.x ? bbox.upper.x : bbox.lower.x;

                this._snap_to_table_boundary(start, current, table, "y");
                this._snap_to_row_boundary(start, current, table);
            } else if (table.label === "table_column") {
                // full height
                start.y = bbox.closest_boundary_to(start).y;
                current.y = start.y === bbox.lower.y ? bbox.upper.y : bbox.lower.y;

                this._snap_to_table_boundary(start, current, table, "x");
                this._snap_to_column_boundary(start, current, table);
            // spanning cell
            } else {
                this._snap_to_table_boundary(start, current, table);
                this._snap_to_column_boundary(start, current, table);
                this._snap_to_row_boundary(start, current, table);
            }

            this._start_point = start;
            box = AABox_from_points([start, current]);

            return box;
        }

        _snap_to_table_boundary(start:Vector2, current:Vector2, table:TableStructure, type?: "x"|"y") {
            if (type === undefined || type === "x") {
                if (table.bbox.distance_to(start) < table.threshold.x) start.x = table.bbox.closest_point_to(start).x;
                if (table.bbox.distance_to(current) < table.threshold.x) current.x = table.bbox.closest_point_to(current).x;
            }
            if (type === undefined || type === "y") {
                if (table.bbox.distance_to(start) < table.threshold.y) start.y = table.bbox.closest_point_to(start).y;
                if (table.bbox.distance_to(current) < table.threshold.y) current.y = table.bbox.closest_point_to(current).y;
            }
        }

        // can break with below if matching multiple columns or rows
        _snap_to_column_boundary(start:Vector2, current:Vector2, table:TableStructure) {
            table.columns.forEach((col) => {
               if (col.distance_to(start) < table.threshold.x) start.x = col.closest_boundary_to(start).x;
               if (col.distance_to(current) < table.threshold.x) current.x = col.closest_boundary_to(current).x;
            });
        }

        _snap_to_row_boundary(start:Vector2, current:Vector2, table:TableStructure) {
            table.rows.forEach((row) => {
               if (row.distance_to(start) < table.threshold.y) start.y = row.closest_boundary_to(start).y;
               if (row.distance_to(current) < table.threshold.y) current.y = row.closest_boundary_to(current).y;
            });
        }
    }
}
